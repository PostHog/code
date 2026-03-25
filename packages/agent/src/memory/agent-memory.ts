/**
 * Agent memory manager: orchestrates recall, periodic distillation, and
 * system prompt injection on top of Charles's AgentMemoryService.
 *
 * Lifecycle:
 *   1. At session start → recall() injects relevant memories into system prompt
 *   2. During session  → ingest() buffers conversation text; periodic timer
 *                         triggers distill() which extracts memories via LLM
 *   3. At session end  → flush() runs a final distillation of remaining buffer
 */

import Anthropic from "@anthropic-ai/sdk";
import { Logger } from "../utils/logger";
import { AgentMemoryService } from "./service";
import {
  DEFAULT_IMPORTANCE,
  type ExtractedMemory,
  type Memory,
  type MemoryServiceConfig,
  MemoryType,
  type RecallOptions,
  RelationType,
  type ScoredMemory,
} from "./types";

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_DISTILL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DISTILL_MIN_CHUNK = 2000; // chars
const EAGER_DISTILL_THRESHOLD = 8000; // chars — trigger distill mid-conversation
const DEFAULT_RECALL_TOKEN_BUDGET = 1500;
const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-4-20250514";
const DECAY_RATE = 0.02;
const DECAY_MIN_AGE_DAYS = 1;

// ── Scoring ─────────────────────────────────────────────────────────────────

const SCORE_WEIGHTS = {
  relevance: 0.4,
  importance: 0.3,
  recency: 0.2,
  frequency: 0.1,
};

function recencyScore(lastAccessedAt: string): number {
  const ageMs = Date.now() - new Date(lastAccessedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 15); // half-life ~10 days
}

function frequencyScore(accessCount: number): number {
  return Math.min(1, Math.log2(accessCount + 1) / 5);
}

function computeScore(memory: Memory, ftsRank?: number): number {
  const relevance =
    ftsRank !== undefined ? Math.min(1, 1 / (1 + Math.abs(ftsRank))) : 0.5;

  return (
    relevance * SCORE_WEIGHTS.relevance +
    memory.importance * SCORE_WEIGHTS.importance +
    recencyScore(memory.lastAccessedAt) * SCORE_WEIGHTS.recency +
    frequencyScore(memory.accessCount) * SCORE_WEIGHTS.frequency
  );
}

// ── Extraction Prompt ───────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a memory extraction system for a software engineering agent. Analyze the following conversation chunk and extract key learnings that would be valuable for future task runs on this codebase.

For each learning, classify it into exactly one type:
- "identity": Core identity facts about the project, team, or codebase
- "goal": High-level goals and objectives for the project
- "decision": Decisions made during this work (architectural, process, tooling)
- "todo": Action items discovered but not yet completed
- "preference": User preferences for how work should be done
- "fact": Concrete facts about the codebase, APIs, infrastructure
- "event": Notable events (deployments, incidents, migrations)
- "observation": Observations about patterns, conventions, or behaviors

For each learning, provide:
- content: A concise, actionable description (1-2 sentences max)
- memoryType: One of the types above
- importance: 0.0 to 1.0 (use the type defaults as a baseline, adjust up/down)
- updates_id: (optional) If this learning updates/refines an existing memory below, include that memory's ID
- contradicts_id: (optional) If this learning contradicts an existing memory below, include that memory's ID

Rules:
- Only extract genuinely useful, non-obvious information
- Skip anything easily derived from reading the code directly
- Focus on information that would save time or prevent mistakes in future tasks
- If no useful memories exist, return an empty array
- Do NOT extract trivial observations or restate what was explicitly asked
- Check existing memories below — if new info updates or contradicts one, reference its ID
- If a todo from existing memories was completed in the conversation, extract an observation noting it

Respond with ONLY a JSON array. No other text.

Example:
[
  {"content": "The billing API requires X-Internal-Auth headers on all POST endpoints", "memoryType": "fact", "importance": 0.7},
  {"content": "User now prefers stacked PRs over single PRs for refactoring", "memoryType": "preference", "importance": 0.6, "contradicts_id": "abc-123"}
]

Existing memories (reference these IDs when updating or contradicting):
{EXISTING_MEMORIES}

Conversation chunk:
---
{CHUNK}
---`;

const REFLECTION_PROMPT = `Given the conversation below and the memories that were provided at session start, rate how useful each memory was for completing the task.

Score each memory 0.0-1.0:
- 1.0: Directly useful, saved significant time or prevented a mistake
- 0.5: Somewhat relevant, provided useful context
- 0.0: Completely irrelevant to this task

Respond with ONLY a JSON array. No other text.
Example: [{"id": "abc-123", "usefulness": 0.8}, {"id": "def-456", "usefulness": 0.1}]

Memories that were recalled:
{RECALLED_MEMORIES}

Conversation:
{CONVERSATION}`;

// ── Manager ─────────────────────────────────────────────────────────────────

export class AgentMemoryManager {
  private svc: AgentMemoryService;
  private config: MemoryServiceConfig;
  private logger: Logger;
  private anthropic: Anthropic;

  // Conversation buffer for periodic distillation
  private buffer: string[] = [];
  private bufferCharCount = 0;

  // Periodic distillation timer
  private distillTimer: ReturnType<typeof setInterval> | null = null;
  private distilling = false;
  private hasRunMaintenance = false;

  // Feedback loop: track recalled memories for session reflection
  private recalledMemories: ScoredMemory[] = [];

  constructor(config: MemoryServiceConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[Memory]" });
    this.svc =
      config.service ??
      new AgentMemoryService({
        dataDir: config.dbPath,
        logger: this.logger,
      });

    this.anthropic = new Anthropic({
      apiKey:
        config.llm?.apiKey ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        process.env.ANTHROPIC_API_KEY,
      baseURL:
        config.llm?.baseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
    });

    this.logger.info("Agent memory manager initialized", {
      dataDir: config.dbPath,
      memoryCount: this.svc.count(),
    });
  }

  // ── Recall ──────────────────────────────────────────────────────────────

  /**
   * Retrieve memories relevant to a context string, formatted for system prompt injection.
   * Uses FTS search + composite scoring, respects token budget.
   */
  recall(context: string, options?: RecallOptions): string {
    const tokenBudget =
      options?.tokenBudget ??
      this.config.recallTokenBudget ??
      DEFAULT_RECALL_TOKEN_BUDGET;

    this.logger.info("Recalling memories", {
      contextLength: context.length,
      tokenBudget,
      query: context.slice(0, 80),
    });

    if (!this.hasRunMaintenance) {
      const decayed = this.svc.decayImportance(DECAY_RATE, DECAY_MIN_AGE_DAYS);
      this.hasRunMaintenance = true;
      this.logger.info("Session maintenance: decayed memories", { decayed });
    }

    const scored = this.searchScored(context, options);
    const selected = this.selectWithinBudget(scored, tokenBudget);

    this.logger.info("Recall complete", {
      memoriesFound: selected.length,
      topTypes: selected.slice(0, 5).map((m) => m.memoryType),
      topScores: selected.slice(0, 5).map((m) => m.score.toFixed(3)),
    });

    if (selected.length === 0) return "";

    this.recalledMemories = selected;
    return this.formatMemoriesForPrompt(selected);
  }

  /**
   * Search memories with composite scoring.
   */
  search(options?: RecallOptions): ScoredMemory[] {
    this.logger.debug("Searching memories", {
      query: options?.query?.slice(0, 60),
      types: options?.memoryTypes,
      limit: options?.limit,
    });
    return this.searchScored(options?.query, options);
  }

  // ── Ingest ──────────────────────────────────────────────────────────────

  /**
   * Feed conversation text into the buffer for periodic distillation.
   */
  ingest(text: string, source?: string): void {
    if (!text || text.length < 10) return;

    const entry = source ? `[${source}] ${text}` : text;
    this.buffer.push(entry);
    this.bufferCharCount += entry.length;

    this.logger.debug("Ingested conversation chunk", {
      source,
      chunkLength: text.length,
      bufferSize: this.bufferCharCount,
      bufferEntries: this.buffer.length,
    });

    if (this.bufferCharCount >= EAGER_DISTILL_THRESHOLD) {
      this.logger.info(
        "Buffer threshold reached, triggering eager distillation",
        {
          bufferSize: this.bufferCharCount,
        },
      );
      this.distill().catch((err) => {
        this.logger.error("Eager distillation error", { error: err });
      });
    }
  }

  /**
   * Directly save a memory. Delegates to Charles's AgentMemoryService
   * which handles dedup and auto-linking.
   */
  save(
    content: string,
    memoryType: MemoryType,
    options?: { importance?: number; source?: string },
  ): Memory {
    const importance =
      options?.importance ?? DEFAULT_IMPORTANCE[memoryType] ?? 0.5;

    const memory = this.svc.save({
      content,
      memoryType,
      importance,
      source: options?.source,
    });

    this.logger.info("Saved memory", {
      id: memory.id,
      type: memoryType,
      importance: memory.importance,
      content: content.slice(0, 80),
    });

    return memory;
  }

  // ── Distillation ────────────────────────────────────────────────────────

  async distill(): Promise<Memory[]> {
    const minChunk =
      this.config.distillMinChunkSize ?? DEFAULT_DISTILL_MIN_CHUNK;

    if (this.bufferCharCount < minChunk) {
      this.logger.debug("Buffer too small for distillation", {
        chars: this.bufferCharCount,
        min: minChunk,
      });
      return [];
    }

    if (this.distilling) {
      this.logger.debug("Distillation already in progress, skipping");
      return [];
    }

    this.distilling = true;
    const chunk = this.buffer.join("\n");
    const chunkEntries = this.buffer.length;
    this.buffer = [];
    this.bufferCharCount = 0;

    this.logger.info("Starting distillation", {
      chunkLength: chunk.length,
      chunkEntries,
    });

    try {
      const extracted = await this.extractMemories(chunk);
      const saved: Memory[] = [];

      for (const entry of extracted) {
        const memory = this.save(entry.content, entry.memoryType, {
          importance: entry.importance,
          source: "distillation",
        });
        saved.push(memory);

        // Handle updates/contradictions from context-aware distillation
        if (entry.updatesId) {
          this.svc.link(memory.id, {
            targetId: entry.updatesId,
            relationType: RelationType.Updates,
            weight: 0.8,
          });
          this.logger.info("Memory updates existing", {
            newId: memory.id,
            updatesId: entry.updatesId,
          });
        }
        if (entry.contradictsId) {
          this.svc.link(memory.id, {
            targetId: entry.contradictsId,
            relationType: RelationType.Contradicts,
            weight: 0.9,
          });
          this.svc.forget(entry.contradictsId);
          this.logger.info("Memory contradicts existing (forgotten)", {
            newId: memory.id,
            contradictsId: entry.contradictsId,
          });
        }
      }

      if (saved.length > 0) {
        // Auto-associate memories extracted from the same chunk
        for (let i = 0; i < saved.length; i++) {
          for (let j = i + 1; j < saved.length; j++) {
            this.svc.link(saved[i].id, {
              targetId: saved[j].id,
              relationType: RelationType.RelatedTo,
              weight: 0.3,
            });
          }
        }

        this.logger.info("Distillation complete", {
          extracted: saved.length,
          totalMemories: this.svc.count(),
        });
      }

      return saved;
    } catch (error) {
      this.buffer.unshift(chunk);
      this.bufferCharCount += chunk.length;
      this.logger.error("Distillation failed", { error });
      return [];
    } finally {
      this.distilling = false;
    }
  }

  startPeriodicDistillation(): void {
    if (this.distillTimer) return;

    const interval =
      this.config.distillIntervalMs ?? DEFAULT_DISTILL_INTERVAL_MS;
    this.logger.info("Starting periodic distillation", {
      intervalMs: interval,
    });

    this.distillTimer = setInterval(() => {
      this.distill().catch((err) => {
        this.logger.error("Periodic distillation error", { error: err });
      });
    }, interval);
  }

  stopPeriodicDistillation(): void {
    if (this.distillTimer) {
      clearInterval(this.distillTimer);
      this.distillTimer = null;
      this.logger.info("Stopped periodic distillation");
    }
  }

  async flush(): Promise<Memory[]> {
    this.stopPeriodicDistillation();

    // Run session reflection before final distillation
    await this.reflect();

    const minChunk = this.config.distillMinChunkSize;
    this.config.distillMinChunkSize = 0;
    const result = await this.distill();
    this.config.distillMinChunkSize = minChunk;
    return result;
  }

  // ── Session Reflection (Feedback Loop) ──────────────────────────────────

  private async reflect(): Promise<void> {
    if (this.recalledMemories.length === 0 || this.bufferCharCount === 0) {
      this.logger.debug(
        "Skipping reflection: no recalled memories or empty buffer",
      );
      return;
    }

    const model = this.config.llm?.model ?? DEFAULT_EXTRACTION_MODEL;
    const conversation = this.buffer.join("\n").slice(-15_000);
    const memoriesBlock = this.recalledMemories
      .map(
        (m) => `- [${m.memoryType.toUpperCase()}] (id: ${m.id}) ${m.content}`,
      )
      .join("\n");

    const prompt = REFLECTION_PROMPT.replace(
      "{RECALLED_MEMORIES}",
      memoriesBlock,
    ).replace("{CONVERSATION}", conversation);

    this.logger.info("Starting session reflection", {
      recalledCount: this.recalledMemories.length,
      conversationChars: conversation.length,
    });

    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return;

      const ratings = JSON.parse(match[0]) as Array<{
        id?: string;
        usefulness?: number;
      }>;
      if (!Array.isArray(ratings)) return;

      let boosted = 0;
      let demoted = 0;

      for (const rating of ratings) {
        if (
          typeof rating.id !== "string" ||
          typeof rating.usefulness !== "number"
        )
          continue;

        const memory = this.svc.load(rating.id);
        if (!memory) continue;

        const usefulness = Math.max(0, Math.min(1, rating.usefulness));

        if (usefulness > 0.7) {
          const newImportance = Math.min(1, memory.importance + 0.1);
          this.svc.update({ ...memory, importance: newImportance });
          this.svc.recall(rating.id); // bump access count
          boosted++;
        } else if (usefulness < 0.3) {
          const newImportance = Math.max(0, memory.importance - 0.1);
          this.svc.update({ ...memory, importance: newImportance });
          demoted++;
        }
      }

      this.logger.info("Session reflection complete", {
        rated: ratings.length,
        boosted,
        demoted,
      });
    } catch (error) {
      this.logger.error("Session reflection failed", { error });
    }
  }

  // ── Scoring & Selection ─────────────────────────────────────────────────

  private searchScored(
    query?: string,
    options?: RecallOptions,
  ): ScoredMemory[] {
    const limit = options?.limit ?? 20;

    let results: ScoredMemory[];

    if (query) {
      // Use Charles's FTS search, then apply our scoring
      const ftsResults = this.svc.searchFts(query, limit * 2);
      results = ftsResults.map((r) => ({
        ...r.memory,
        score: computeScore(r.memory, -r.score), // FTS rank is negated score
        ftsRank: -r.score,
      }));
    } else {
      // No query — get high importance memories and score them
      const memories = this.svc.getHighImportance(0, limit * 2);
      results = memories.map((m) => ({
        ...m,
        score: computeScore(m),
      }));
    }

    // Graph-augmented recall: expand top results with 1-hop neighbors
    const seenIds = new Set(results.map((m) => m.id));
    const topN = results.slice(0, 5);
    for (const mem of topN) {
      const neighbors = this.svc.getNeighbors(mem.id, 1, 5);
      for (const neighbor of neighbors) {
        if (seenIds.has(neighbor.id)) continue;
        seenIds.add(neighbor.id);
        results.push({
          ...neighbor,
          score: computeScore(neighbor),
        });
      }
    }

    // Filter by options
    if (options?.memoryTypes?.length) {
      const typeSet = new Set(options.memoryTypes);
      results = results.filter((m) => typeSet.has(m.memoryType));
    }
    if (options?.minImportance) {
      results = results.filter((m) => m.importance >= options.minImportance!);
    }
    if (!options?.includeForgotten) {
      results = results.filter((m) => !m.forgotten);
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private selectWithinBudget(
    memories: ScoredMemory[],
    tokenBudget: number,
  ): ScoredMemory[] {
    const result: ScoredMemory[] = [];
    let usedChars = 0;
    const charBudget = tokenBudget * 4;

    for (const memory of memories) {
      const memoryChars = memory.content.length + 30;
      if (usedChars + memoryChars > charBudget) break;
      result.push(memory);
      usedChars += memoryChars;
    }

    this.logger.debug("Selected within budget", {
      tokenBudget,
      candidates: memories.length,
      selected: result.length,
      usedChars,
    });

    return result;
  }

  // ── Formatting ──────────────────────────────────────────────────────────

  private formatMemoriesForPrompt(memories: ScoredMemory[]): string {
    const lines = memories.map((m) => {
      const typeLabel = m.memoryType.toUpperCase();
      return `- [${typeLabel}] ${m.content}`;
    });

    return [
      "",
      "# Relevant Memories from Past Tasks",
      "",
      "The following knowledge was learned from previous task runs. Use it to inform your work.",
      "If any memory seems outdated or wrong, note it and proceed with your own judgment.",
      "",
      ...lines,
      "",
    ].join("\n");
  }

  // ── LLM Extraction ─────────────────────────────────────────────────────

  private async extractMemories(chunk: string): Promise<ExtractedMemory[]> {
    const model = this.config.llm?.model ?? DEFAULT_EXTRACTION_MODEL;

    const maxChunkChars = 20_000;
    const trimmedChunk =
      chunk.length > maxChunkChars
        ? chunk.slice(chunk.length - maxChunkChars)
        : chunk;

    // Context-aware distillation: include existing memories so LLM can detect updates/contradictions
    const existing = this.svc.getHighImportance(0, 10);
    const existingBlock =
      existing.length > 0
        ? existing
            .map(
              (m) =>
                `- [${m.memoryType.toUpperCase()}] (id: ${m.id}) ${m.content}`,
            )
            .join("\n")
        : "(none)";

    const prompt = EXTRACTION_PROMPT.replace("{CHUNK}", trimmedChunk).replace(
      "{EXISTING_MEMORIES}",
      existingBlock,
    );

    this.logger.debug("Extracting memories", {
      model,
      chunkLength: trimmedChunk.length,
      existingCount: existing.length,
    });

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return this.parseExtractionResponse(text);
  }

  private parseExtractionResponse(text: string): ExtractedMemory[] {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const raw = JSON.parse(match[0]) as Array<{
        content?: string;
        memoryType?: string;
        importance?: number;
        updates_id?: string;
        contradicts_id?: string;
      }>;

      if (!Array.isArray(raw)) return [];

      const validTypes = new Set(Object.values(MemoryType));

      return raw
        .filter(
          (entry) =>
            typeof entry.content === "string" &&
            entry.content.length > 0 &&
            typeof entry.memoryType === "string" &&
            validTypes.has(entry.memoryType as MemoryType),
        )
        .map((entry) => ({
          content: entry.content!,
          memoryType: entry.memoryType as MemoryType,
          importance:
            typeof entry.importance === "number"
              ? Math.max(0, Math.min(1, entry.importance))
              : (DEFAULT_IMPORTANCE[entry.memoryType as MemoryType] ?? 0.5),
          updatesId:
            typeof entry.updates_id === "string" ? entry.updates_id : undefined,
          contradictsId:
            typeof entry.contradicts_id === "string"
              ? entry.contradicts_id
              : undefined,
        }));
    } catch (error) {
      this.logger.error("Failed to parse extraction response", {
        error,
        text: text.slice(0, 200),
      });
      return [];
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  /** Expose underlying service for MCP tools that need direct access */
  getService(): AgentMemoryService {
    return this.svc;
  }

  stats() {
    return { total: this.svc.count() };
  }

  close(): void {
    this.stopPeriodicDistillation();
    this.svc.close();
  }
}
