import { join } from "node:path";
import type { Logger } from "../utils/logger";
import type { Embedder } from "./embedding";
import { AgentMemoryRepository } from "./repository";
import {
  type Association,
  type CreateAssociationInput,
  type CreateMemoryInput,
  type MemorySearchResult,
  clampImportance,
  type Memory,
  type MemoryType,
  RelationType,
  type SortOrder,
} from "./types";

export interface MemoryServiceOptions {
  dataDir: string;
  embedder?: Embedder;
  vectorDimensions?: number;
  logger?: Logger;
}

export class AgentMemoryService {
  private repo: AgentMemoryRepository;
  private embedder: Embedder | null;
  private logger?: Logger;

  constructor(options: MemoryServiceOptions) {
    this.logger = options.logger?.child("memory");
    this.embedder = options.embedder ?? null;
    this.repo = new AgentMemoryRepository({
      dbPath: join(options.dataDir, "knowledge.db"),
      logger: this.logger,
      vectorDimensions: options.vectorDimensions,
    });
  }

  async save(input: CreateMemoryInput): Promise<Memory> {
    const existing = this.repo.searchText(input.content, 5);

    for (const match of existing) {
      if (
        match.memoryType === input.memoryType &&
        match.content === input.content
      ) {
        this.logger?.debug("Exact duplicate, bumping existing", {
          id: match.id,
        });
        const importance = input.importance ?? match.importance;
        this.repo.update({ ...match, importance: clampImportance(importance) });
        this.repo.recordAccess(match.id);
        return this.repo.load(match.id)!;
      }
    }

    const memory = this.repo.save(input);

    if (this.embedder) {
      try {
        const embedding = await this.embedder.embed(memory.content);
        this.repo.saveEmbedding(memory.id, embedding);
      } catch (err) {
        this.logger?.debug("Failed to generate embedding", {
          id: memory.id,
          error: err,
        });
      }
    }

    for (const match of existing) {
      if (match.memoryType === input.memoryType) {
        this.repo.createAssociation(memory.id, {
          targetId: match.id,
          relationType: RelationType.RelatedTo,
          weight: 0.5,
        });
      }
    }

    return memory;
  }

  async searchSemantic(
    query: string,
    k = 20,
  ): Promise<MemorySearchResult[]> {
    if (!this.embedder) return [];

    const queryVec = await this.embedder.embed(query);
    const vecResults = this.repo.searchVector(queryVec, k);

    const memories = this.repo.loadMany(
      vecResults.map((r) => r.memory_id),
    );
    const memoryMap = new Map(memories.map((m) => [m.id, m]));

    return vecResults
      .map((r, i) => {
        const memory = memoryMap.get(r.memory_id);
        if (!memory || memory.forgotten) return null;
        return {
          memory,
          score: 1 / (1 + r.distance),
          rank: i + 1,
        };
      })
      .filter((r): r is MemorySearchResult => r !== null);
  }

  recall(id: string): Memory | null {
    this.repo.recordAccess(id);
    return this.repo.load(id);
  }

  load(id: string): Memory | null {
    return this.repo.load(id);
  }

  update(memory: Memory): void {
    this.repo.update(memory);
  }

  async updateWithEmbedding(memory: Memory): Promise<void> {
    this.repo.update(memory);
    if (this.embedder) {
      try {
        const embedding = await this.embedder.embed(memory.content);
        this.repo.saveEmbedding(memory.id, embedding);
      } catch (err) {
        this.logger?.debug("Failed to update embedding", {
          id: memory.id,
          error: err,
        });
      }
    }
  }

  delete(id: string): boolean {
    return this.repo.delete(id);
  }

  forget(id: string): boolean {
    return this.repo.forget(id);
  }

  link(sourceId: string, input: CreateAssociationInput): Association {
    return this.repo.createAssociation(sourceId, input);
  }

  getAssociations(memoryId: string): Association[] {
    return this.repo.getAssociations(memoryId);
  }

  getByType(memoryType: MemoryType, limit?: number): Memory[] {
    return this.repo.getByType(memoryType, limit);
  }

  getHighImportance(threshold?: number, limit?: number): Memory[] {
    return this.repo.getHighImportance(threshold, limit);
  }

  getSorted(
    order: SortOrder,
    options?: { memoryType?: MemoryType; limit?: number },
  ): Memory[] {
    return this.repo.getSorted(order, options);
  }

  searchText(query: string, limit?: number): Memory[] {
    return this.repo.searchText(query, limit);
  }

  getNeighbors(memoryId: string, depth?: number, limit?: number): Memory[] {
    const ids = this.repo.getNeighborIds(memoryId, depth, limit);
    return this.repo.loadMany(ids);
  }

  async merge(keepId: string, mergeId: string): Promise<Memory | null> {
    const keep = this.repo.load(keepId);
    const merge = this.repo.load(mergeId);
    if (!keep || !merge) return null;

    const mergedContent = `${keep.content}\n\n${merge.content}`;
    const maxImportance = Math.max(keep.importance, merge.importance);

    this.repo.mergeMemories(
      keepId,
      mergeId,
      mergedContent,
      maxImportance,
      merge.accessCount,
    );

    if (this.embedder) {
      try {
        const embedding = await this.embedder.embed(mergedContent);
        this.repo.saveEmbedding(keepId, embedding);
      } catch (err) {
        this.logger?.debug("Failed to update merged embedding", {
          keepId,
          error: err,
        });
      }
    }

    this.logger?.debug("Memories merged", { keepId, mergeId });
    return this.repo.load(keepId);
  }

  decayImportance(decayRate = 0.05, minAgeDays = 1): number {
    const memories = this.repo.getSorted("recent", { limit: 10000 });
    const now = Date.now();
    let decayed = 0;

    for (const memory of memories) {
      if (memory.memoryType === "identity") continue;

      const ageDays =
        (now - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < minAgeDays) continue;

      const newImportance = clampImportance(
        memory.importance * (1 - ageDays * decayRate),
      );
      if (newImportance !== memory.importance) {
        this.repo.update({ ...memory, importance: newImportance });
        decayed++;
      }
    }

    this.logger?.debug("Decay pass complete", { decayed });
    return decayed;
  }

  prune(threshold = 0.1, minAgeDays = 30): number {
    const memories = this.repo.getSorted("importance", { limit: 10000 });
    const now = Date.now();
    let pruned = 0;

    for (const memory of memories) {
      if (memory.memoryType === "identity") continue;
      if (memory.importance >= threshold) break;

      const ageDays =
        (now - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < minAgeDays) continue;

      this.repo.delete(memory.id);
      pruned++;
    }

    this.logger?.debug("Prune pass complete", { pruned });
    return pruned;
  }

  count(): number {
    return this.repo.count();
  }

  close(): void {
    this.repo.close();
  }
}
