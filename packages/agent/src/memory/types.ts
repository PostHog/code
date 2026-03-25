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
  CausedBy: "caused_by",
  ResultOf: "result_of",
  PartOf: "part_of",
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

export interface VectorSearchResult {
  memory_id: string;
  distance: number;
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
