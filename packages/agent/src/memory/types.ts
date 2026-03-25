export const MemoryType = {
  Fact: "fact",
  Preference: "preference",
  Decision: "decision",
  Identity: "identity",
  Event: "event",
  Observation: "observation",
  Goal: "goal",
  Todo: "todo",
} as const;

export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const DEFAULT_IMPORTANCE: Record<MemoryType, number> = {
  [MemoryType.Identity]: 1.0,
  [MemoryType.Goal]: 0.9,
  [MemoryType.Decision]: 0.8,
  [MemoryType.Todo]: 0.8,
  [MemoryType.Preference]: 0.7,
  [MemoryType.Fact]: 0.6,
  [MemoryType.Event]: 0.4,
  [MemoryType.Observation]: 0.3,
};

export const RelationType = {
  RelatedTo: "related_to",
  Updates: "updates",
  Contradicts: "contradicts",
} as const;

export type RelationType = (typeof RelationType)[keyof typeof RelationType];

export interface Memory {
  id: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  source: string | null;
  forgotten: boolean;
}

export interface Association {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  weight: number;
  createdAt: string;
}

export interface CreateMemoryInput {
  content: string;
  memoryType: MemoryType;
  importance?: number;
  source?: string;
  associations?: CreateAssociationInput[];
}

export interface CreateAssociationInput {
  targetId: string;
  relationType: RelationType;
  weight?: number;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  rank: number;
}

export const SortOrder = {
  Recent: "recent",
  Importance: "importance",
  MostAccessed: "most_accessed",
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

export const SearchMode = {
  Hybrid: "hybrid",
  Recent: "recent",
  Important: "important",
  Typed: "typed",
} as const;

export type SearchMode = (typeof SearchMode)[keyof typeof SearchMode];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampImportance(value: number): number {
  return clamp(value, 0, 1);
}

export function clampWeight(value: number): number {
  return clamp(value, 0, 1);
}

// ── Agent integration types (MCP tools, recall, distillation) ───────────

export interface ScoredMemory extends Memory {
  score: number;
  /** FTS match rank (lower = better match, absent if no FTS query) */
  ftsRank?: number;
}

export interface ExtractedMemory {
  content: string;
  memoryType: MemoryType;
  importance: number;
  /** ID of an existing memory this one updates */
  updatesId?: string;
  /** ID of an existing memory this one contradicts */
  contradictsId?: string;
}

export interface MemoryServiceConfig {
  /** Path to the SQLite database file (ignored if `service` is provided) */
  dbPath: string;
  /** Pre-existing AgentMemoryService to reuse (avoids dual SQLite connections) */
  service?: import("./service").AgentMemoryService;
  /** Interval between periodic distillation runs (default: 5 min) */
  distillIntervalMs?: number;
  /** Minimum buffered chars before a distillation is triggered (default: 2000) */
  distillMinChunkSize?: number;
  /** Max approximate tokens for recalled memories in system prompt (default: 1500) */
  recallTokenBudget?: number;
  /** LLM config for memory extraction. Falls back to ANTHROPIC_* env vars. */
  llm?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
}

export interface RecallOptions {
  /** Natural language query for FTS search */
  query?: string;
  /** Filter by memory types */
  memoryTypes?: MemoryType[];
  /** Max number of memories to return */
  limit?: number;
  /** Approximate token budget (chars / 4) */
  tokenBudget?: number;
  /** Minimum importance threshold */
  minImportance?: number;
  /** Include soft-deleted memories */
  includeForgotten?: boolean;
}

export interface MemoryConfig {
  /** Enable the memory system */
  enabled: boolean;
  /** Path to the SQLite database file (ignored if `service` is provided) */
  dbPath: string;
  /** Pre-existing AgentMemoryService to reuse (avoids dual SQLite connections) */
  service?: import("./service").AgentMemoryService;
  /** Interval between periodic distillation runs in ms (default: 300_000 = 5 min) */
  distillIntervalMs?: number;
  /** Max approximate tokens for recalled memories (default: 1500) */
  recallTokenBudget?: number;
  /** LLM config overrides for extraction (defaults to gateway env vars) */
  llm?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
}
