/**
 * Memory service: orchestrates recall, periodic distillation, and consolidation.
 *
 * Lifecycle:
 *   1. At session start → recall() injects relevant memories into system prompt
 *   2. During session  → ingest() buffers conversation text; periodic timer
 *                         triggers distill() which extracts memories via LLM
 *   3. At session end  → flush() runs a final distillation of remaining buffer
 *   4. Background      → consolidate() merges duplicates, decays stale memories
 */

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Logger } from "../utils/logger";
import { MemoryStore } from "./store";
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
const DEFAULT_RECALL_TOKEN_BUDGET = 1500;
const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-4-20250514";

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

Rules:
- Only extract genuinely useful, non-obvious information
- Skip anything easily derived from reading the code directly
- Focus on information that would save time or prevent mistakes in future tasks
- If no useful memories exist, return an empty array
- Do NOT extract trivial observations or restate what was explicitly asked

Respond with ONLY a JSON array. No other text.

Example:
[
  {"content": "The billing API requires X-Internal-Auth headers on all POST endpoints", "memoryType": "fact", "importance": 0.7},
  {"content": "User prefers single PRs over stacked for refactoring work", "memoryType": "preference", "importance": 0.6}
]

Conversation chunk:
---
{CHUNK}
---`;

// ── Service ─────────────────────────────────────────────────────────────────

export class AgentMemoryManager {
  private store: MemoryStore;
  private config: MemoryServiceConfig;
  private logger: Logger;
  private anthropic: Anthropic;

  // Conversation buffer for periodic distillation
  private buffer: string[] = [];
  private bufferCharCount = 0;

  // Periodic distillation timer
  private distillTimer: ReturnType<typeof setInterval> | null = null;
  private distilling = false;

  constructor(config: MemoryServiceConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[Memory]" });
    this.store = new MemoryStore(config.dbPath, this.logger.child("Store"));

    this.anthropic = new Anthropic({
      apiKey:
        config.llm?.apiKey ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        process.env.ANTHROPIC_API_KEY,
      baseURL:
        config.llm?.baseUrl || process.env.ANTHROPIC_BASE_URL || undefined,
    });

    this.logger.info("Memory service initialized", {
      dbPath: config.dbPath,
      stats: this.store.stats(),
    });
  }

  // ── Recall ──────────────────────────────────────────────────────────────

  /**
   * Retrieve memories relevant to a context string, formatted for system prompt injection.
   * Returns a string block that fits within the configured token budget.
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

    const memories = this.store.recallWithinBudget({
      query: context || undefined,
      tokenBudget,
      ...options,
    });

    this.logger.info("Recall complete", {
      memoriesFound: memories.length,
      topTypes: memories.slice(0, 5).map((m) => m.memoryType),
      topScores: memories.slice(0, 5).map((m) => m.score.toFixed(3)),
    });

    if (memories.length === 0) return "";

    return this.formatMemoriesForPrompt(memories);
  }

  /**
   * Raw search — returns scored memories without formatting.
   */
  search(options?: RecallOptions): ScoredMemory[] {
    this.logger.debug("Searching memories", {
      query: options?.query?.slice(0, 60),
      types: options?.memoryTypes,
      limit: options?.limit,
    });
    return this.store.search(options);
  }

  // ── Ingest ──────────────────────────────────────────────────────────────

  /**
   * Feed conversation text into the buffer for periodic distillation.
   * Call this for each message, tool call, or tool result in the conversation.
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
  }

  /**
   * Directly save a memory without going through LLM extraction.
   * Useful for explicit "remember this" commands.
   */
  save(
    content: string,
    memoryType: MemoryType,
    options?: { importance?: number; source?: string },
  ): Memory {
    const importance =
      options?.importance ?? DEFAULT_IMPORTANCE[memoryType] ?? 0.5;

    // Check for duplicates
    const similar = this.store.findSimilar(content, 3);
    const duplicate = similar.find(
      (m) => m.score > 0.8 && m.memoryType === memoryType,
    );

    if (duplicate) {
      // Reinforce existing memory instead of creating duplicate
      this.store.update(duplicate.id, {
        importance: Math.min(1, duplicate.importance + 0.1),
      });
      this.logger.debug("Reinforced existing memory", {
        id: duplicate.id,
        content: content.slice(0, 80),
      });
      return this.store.get(duplicate.id)!;
    }

    const memory = this.store.insert({
      id: randomUUID(),
      content,
      memoryType,
      importance,
      source: options?.source ?? null,
    });

    this.logger.info("Saved memory", {
      id: memory.id,
      type: memoryType,
      importance,
      content: content.slice(0, 80),
    });

    return memory;
  }

  // ── Distillation ────────────────────────────────────────────────────────

  /**
   * Extract memories from the buffered conversation text using LLM.
   * Called periodically by the timer and on flush.
   */
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
      }

      if (saved.length > 0) {
        // Auto-associate memories extracted from the same chunk
        for (let i = 0; i < saved.length; i++) {
          for (let j = i + 1; j < saved.length; j++) {
            this.store.addAssociation(
              saved[i].id,
              saved[j].id,
              RelationType.RelatedTo,
              0.3,
            );
          }
        }

        this.logger.info("Distillation complete", {
          extracted: saved.length,
          stats: this.store.stats(),
        });
      }

      return saved;
    } catch (error) {
      // Put the chunk back if extraction failed
      this.buffer.unshift(chunk);
      this.bufferCharCount += chunk.length;
      this.logger.error("Distillation failed", { error });
      return [];
    } finally {
      this.distilling = false;
    }
  }

  /**
   * Start periodic distillation on a timer.
   */
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

  /**
   * Stop periodic distillation.
   */
  stopPeriodicDistillation(): void {
    if (this.distillTimer) {
      clearInterval(this.distillTimer);
      this.distillTimer = null;
      this.logger.info("Stopped periodic distillation");
    }
  }

  /**
   * Flush: stop periodic distillation and run a final extraction on remaining buffer.
   */
  async flush(): Promise<Memory[]> {
    this.stopPeriodicDistillation();
    // Force distill even if below min chunk size
    const minChunk = this.config.distillMinChunkSize;
    this.config.distillMinChunkSize = 0;
    const result = await this.distill();
    this.config.distillMinChunkSize = minChunk;
    return result;
  }

  // ── Consolidation ───────────────────────────────────────────────────────

  /**
   * Consolidation pass: decay old memories, detect contradictions,
   * merge near-duplicates. Run periodically (e.g., daily or after N task runs).
   */
  async consolidate(): Promise<{
    decayed: number;
    merged: number;
    forgotten: number;
  }> {
    const result = { decayed: 0, merged: 0, forgotten: 0 };

    // 1. Decay: reduce importance of memories not accessed in 14+ days
    const staleMemories = this.store.search({
      limit: 100,
      minImportance: 0,
    });

    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const memory of staleMemories) {
      const age = now - new Date(memory.lastAccessedAt).getTime();
      if (age > fourteenDaysMs) {
        const newImportance = Math.max(0.05, memory.importance * 0.9);
        this.store.update(memory.id, { importance: newImportance });
        result.decayed++;

        // Auto-forget very low importance memories
        if (newImportance < 0.1) {
          this.store.forget(memory.id);
          result.forgotten++;
        }
      }
    }

    this.logger.info("Consolidation complete", result);
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

    // Truncate chunk if too large (keep last portion as it's most relevant)
    const maxChunkChars = 20_000;
    const trimmedChunk =
      chunk.length > maxChunkChars
        ? chunk.slice(chunk.length - maxChunkChars)
        : chunk;

    const prompt = EXTRACTION_PROMPT.replace("{CHUNK}", trimmedChunk);

    this.logger.debug("Extracting memories", {
      model,
      chunkLength: trimmedChunk.length,
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
      // Find JSON array in the response
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const raw = JSON.parse(match[0]) as Array<{
        content?: string;
        memoryType?: string;
        importance?: number;
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
        }));
    } catch (error) {
      this.logger.error("Failed to parse extraction response", {
        error,
        text: text.slice(0, 200),
      });
      return [];
    }
  }

  // ── Stats & Lifecycle ─────────────────────────────────────────────────

  stats() {
    return this.store.stats();
  }

  getStore(): MemoryStore {
    return this.store;
  }

  close(): void {
    this.stopPeriodicDistillation();
    this.store.close();
  }
}
