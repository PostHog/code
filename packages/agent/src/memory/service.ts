import { join } from "node:path";
import type { Logger } from "../utils/logger";
import { AgentMemoryRepository } from "./repository";
import {
  type Association,
  type CreateAssociationInput,
  type CreateMemoryInput,
  clampImportance,
  type Memory,
  type MemorySearchResult,
  type MemoryType,
  RelationType,
  type SortOrder,
} from "./types";

export interface MemoryServiceOptions {
  dataDir: string;
  logger?: Logger;
}

export class AgentMemoryService {
  private repo: AgentMemoryRepository;
  private logger?: Logger;

  constructor(options: MemoryServiceOptions) {
    this.logger = options.logger?.child("memory");
    this.repo = new AgentMemoryRepository({
      dbPath: join(options.dataDir, "knowledge.db"),
      logger: this.logger,
    });
  }

  save(input: CreateMemoryInput): Memory {
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

    // Only link to the top 2 same-type matches to avoid edge sprawl
    let linked = 0;
    for (const match of existing) {
      if (linked >= 2) break;
      if (match.memoryType === input.memoryType) {
        this.repo.createAssociation(memory.id, {
          targetId: match.id,
          relationType: RelationType.RelatedTo,
          weight: 0.5,
        });
        linked++;
      }
    }

    return memory;
  }

  searchFts(query: string, limit?: number): MemorySearchResult[] {
    return this.repo.searchFts(query, limit);
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

  getAssociationsBetween(memoryIds: string[]): Association[] {
    return this.repo.getAssociationsBetween(memoryIds);
  }

  pruneWeakEdges(maxWeight = 0.3): number {
    const pruned = this.repo.pruneWeakEdges(maxWeight);
    this.logger?.debug("Pruned weak edges", { pruned, maxWeight });
    return pruned;
  }

  getByType(memoryType: MemoryType, limit?: number): Memory[] {
    return this.repo.getByType(memoryType, limit);
  }

  getHighImportance(threshold?: number, limit?: number): Memory[] {
    return this.repo.getHighImportance(threshold, limit);
  }

  getWeaklyConnected(maxAssociations?: number, limit?: number): Memory[] {
    return this.repo.getWeaklyConnected(maxAssociations, limit);
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

  merge(keepId: string, mergeId: string): Memory | null {
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

      // Access-weighted decay: frequently accessed memories decay up to 70% slower
      const accessProtection = Math.min(
        1,
        Math.log2(memory.accessCount + 1) / 5,
      );
      const effectiveDecay = decayRate * (1 - accessProtection * 0.7);

      const newImportance = clampImportance(
        memory.importance * (1 - ageDays * effectiveDecay),
      );
      if (newImportance !== memory.importance) {
        this.repo.update({ ...memory, importance: newImportance });
        decayed++;
      }
    }

    this.logger?.debug("Decay pass complete", { decayed });
    return decayed;
  }

  consolidate(limit = 50): number {
    const memories = this.repo.getSorted("importance", { limit });
    const merged = new Set<string>();
    let mergeCount = 0;

    for (const memory of memories) {
      if (merged.has(memory.id)) continue;
      if (memory.memoryType === "identity") continue;

      const similar = this.repo.searchText(memory.content, 5);
      for (const candidate of similar) {
        if (candidate.id === memory.id) continue;
        if (merged.has(candidate.id)) continue;
        if (candidate.memoryType !== memory.memoryType) continue;

        // Simple similarity: same type + high word overlap
        const wordsA = new Set(memory.content.toLowerCase().split(/\s+/));
        const wordsB = new Set(candidate.content.toLowerCase().split(/\s+/));
        const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard > 0.6) {
          const keepId =
            memory.importance >= candidate.importance
              ? memory.id
              : candidate.id;
          const mergeId = keepId === memory.id ? candidate.id : memory.id;
          this.merge(keepId, mergeId);
          merged.add(mergeId);
          mergeCount++;
        }
      }
    }

    this.logger?.debug("Consolidation pass complete", { merged: mergeCount });
    return mergeCount;
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
