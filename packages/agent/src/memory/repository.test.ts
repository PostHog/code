import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentMemoryRepository } from "./repository";
import { MemoryType, RelationType } from "./types";

function createTmpDir(): string {
  const dir = join(tmpdir(), `memory-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("AgentMemoryRepository", () => {
  let repo: AgentMemoryRepository;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    repo = new AgentMemoryRepository({
      dbPath: join(tmpDir, "test.db"),
      vectorDimensions: 4,
    });
  });

  afterEach(() => {
    repo.close();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("save and load", () => {
    it("saves a memory and loads it by id", () => {
      const memory = repo.save({
        content: "User prefers dark mode",
        memoryType: MemoryType.Preference,
      });

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe("User prefers dark mode");
      expect(memory.memoryType).toBe(MemoryType.Preference);
      expect(memory.importance).toBe(0.7);
      expect(memory.accessCount).toBe(0);
      expect(memory.forgotten).toBe(false);

      const loaded = repo.load(memory.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.content).toBe("User prefers dark mode");
    });

    it("returns null for missing id", () => {
      expect(repo.load("nonexistent")).toBeNull();
    });

    it("uses default importance per type", () => {
      expect(
        repo.save({ content: "i", memoryType: MemoryType.Identity }).importance,
      ).toBe(1.0);
      expect(
        repo.save({ content: "e", memoryType: MemoryType.Event }).importance,
      ).toBe(0.4);
      expect(
        repo.save({ content: "o", memoryType: MemoryType.Observation })
          .importance,
      ).toBe(0.3);
    });

    it("accepts custom importance", () => {
      expect(
        repo.save({
          content: "c",
          memoryType: MemoryType.Fact,
          importance: 0.95,
        }).importance,
      ).toBe(0.95);
    });

    it("clamps importance to 0-1", () => {
      expect(
        repo.save({
          content: "h",
          memoryType: MemoryType.Fact,
          importance: 5.0,
        }).importance,
      ).toBe(1.0);
      expect(
        repo.save({
          content: "l",
          memoryType: MemoryType.Fact,
          importance: -1.0,
        }).importance,
      ).toBe(0.0);
    });

    it("saves with source", () => {
      expect(
        repo.save({
          content: "x",
          memoryType: MemoryType.Fact,
          source: "s-123",
        }).source,
      ).toBe("s-123");
    });
  });

  describe("update", () => {
    it("updates memory fields", () => {
      const memory = repo.save({
        content: "original",
        memoryType: MemoryType.Fact,
      });
      repo.update({ ...memory, content: "updated", importance: 0.9 });
      const loaded = repo.load(memory.id)!;
      expect(loaded.content).toBe("updated");
      expect(loaded.importance).toBe(0.9);
    });
  });

  describe("delete", () => {
    it("deletes a memory and returns true", () => {
      const memory = repo.save({
        content: "to delete",
        memoryType: MemoryType.Fact,
      });
      expect(repo.delete(memory.id)).toBe(true);
      expect(repo.load(memory.id)).toBeNull();
    });

    it("returns false for missing id", () => {
      expect(repo.delete("nonexistent")).toBe(false);
    });

    it("cleans up embedding on delete", () => {
      const memory = repo.save({
        content: "with vec",
        memoryType: MemoryType.Fact,
      });
      repo.saveEmbedding(memory.id, new Float32Array([1, 2, 3, 4]));
      expect(repo.hasEmbedding(memory.id)).toBe(true);

      repo.delete(memory.id);
      expect(repo.hasEmbedding(memory.id)).toBe(false);
    });
  });

  describe("recordAccess", () => {
    it("increments access count", () => {
      const memory = repo.save({
        content: "accessed",
        memoryType: MemoryType.Fact,
      });
      repo.recordAccess(memory.id);
      repo.recordAccess(memory.id);
      expect(repo.load(memory.id)?.accessCount).toBe(2);
    });
  });

  describe("forget", () => {
    it("soft-deletes a memory", () => {
      const memory = repo.save({
        content: "to forget",
        memoryType: MemoryType.Fact,
      });
      expect(repo.forget(memory.id)).toBe(true);
      expect(repo.load(memory.id)?.forgotten).toBe(true);
    });

    it("returns false when already forgotten", () => {
      const memory = repo.save({
        content: "already",
        memoryType: MemoryType.Fact,
      });
      repo.forget(memory.id);
      expect(repo.forget(memory.id)).toBe(false);
    });

    it("excludes forgotten memories from queries", () => {
      repo.save({ content: "visible", memoryType: MemoryType.Fact });
      const hidden = repo.save({
        content: "hidden",
        memoryType: MemoryType.Fact,
      });
      repo.forget(hidden.id);
      const results = repo.getByType(MemoryType.Fact);
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("visible");
    });
  });

  describe("associations", () => {
    it("creates and retrieves associations", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      const assoc = repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
        weight: 0.8,
      });

      expect(assoc.sourceId).toBe(a.id);
      expect(assoc.targetId).toBe(b.id);
      expect(assoc.weight).toBe(0.8);
      expect(repo.getAssociations(a.id)).toHaveLength(1);
      expect(repo.getAssociations(b.id)).toHaveLength(1);
    });

    it("upserts on duplicate source/target/type", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
        weight: 0.3,
      });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
        weight: 0.9,
      });
      const assocs = repo.getAssociations(a.id);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].weight).toBe(0.9);
    });

    it("allows different relation types between same memories", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.Updates,
      });
      expect(repo.getAssociations(a.id)).toHaveLength(2);
    });

    it("cascades delete to associations", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      repo.delete(a.id);
      expect(repo.getAssociations(b.id)).toHaveLength(0);
    });

    it("gets associations between a set of memories", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "C", memoryType: MemoryType.Fact });
      const d = repo.save({ content: "D", memoryType: MemoryType.Fact });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      repo.createAssociation(b.id, {
        targetId: c.id,
        relationType: RelationType.RelatedTo,
      });
      repo.createAssociation(c.id, {
        targetId: d.id,
        relationType: RelationType.RelatedTo,
      });
      expect(repo.getAssociationsBetween([a.id, b.id, c.id])).toHaveLength(2);
    });
  });

  describe("queries", () => {
    it("getByType filters by type", () => {
      repo.save({ content: "fact 1", memoryType: MemoryType.Fact });
      repo.save({ content: "fact 2", memoryType: MemoryType.Fact });
      repo.save({ content: "pref 1", memoryType: MemoryType.Preference });
      expect(repo.getByType(MemoryType.Fact)).toHaveLength(2);
      expect(repo.getByType(MemoryType.Preference)).toHaveLength(1);
    });

    it("getHighImportance filters by threshold", () => {
      repo.save({
        content: "high",
        memoryType: MemoryType.Identity,
        importance: 1.0,
      });
      repo.save({
        content: "mid",
        memoryType: MemoryType.Fact,
        importance: 0.5,
      });
      repo.save({
        content: "low",
        memoryType: MemoryType.Observation,
        importance: 0.2,
      });
      const high = repo.getHighImportance(0.7);
      expect(high).toHaveLength(1);
      expect(high[0].content).toBe("high");
    });

    it("getSorted orders by different criteria", () => {
      const old = repo.save({
        content: "old",
        memoryType: MemoryType.Fact,
        importance: 0.9,
      });
      repo.save({
        content: "recent",
        memoryType: MemoryType.Fact,
        importance: 0.3,
      });
      repo.recordAccess(old.id);
      repo.recordAccess(old.id);
      repo.recordAccess(old.id);

      expect(repo.getSorted("importance")[0].content).toBe("old");
      expect(repo.getSorted("most_accessed")[0].content).toBe("old");
      expect(repo.getSorted("recent")[0].content).toBe("recent");
    });

    it("getSorted filters by type", () => {
      repo.save({ content: "fact", memoryType: MemoryType.Fact });
      repo.save({ content: "pref", memoryType: MemoryType.Preference });
      const facts = repo.getSorted("recent", { memoryType: MemoryType.Fact });
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("fact");
    });
  });

  describe("text search", () => {
    it("finds memories by keyword", () => {
      repo.save({
        content: "The user prefers TypeScript over JavaScript",
        memoryType: MemoryType.Preference,
      });
      repo.save({
        content: "Meeting scheduled for Monday morning",
        memoryType: MemoryType.Event,
      });
      const results = repo.searchText("TypeScript");
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("TypeScript");
    });

    it("returns empty for no match", () => {
      repo.save({ content: "hello world", memoryType: MemoryType.Fact });
      expect(repo.searchText("nonexistent")).toHaveLength(0);
    });
  });

  describe("getNeighborIds", () => {
    it("traverses graph to specified depth", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "C", memoryType: MemoryType.Fact });
      const d = repo.save({ content: "D", memoryType: MemoryType.Fact });
      repo.createAssociation(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      repo.createAssociation(b.id, {
        targetId: c.id,
        relationType: RelationType.RelatedTo,
      });
      repo.createAssociation(c.id, {
        targetId: d.id,
        relationType: RelationType.RelatedTo,
      });

      expect(repo.getNeighborIds(a.id, 1)).toHaveLength(1);
      expect(repo.getNeighborIds(a.id, 2)).toHaveLength(2);
      expect(repo.getNeighborIds(a.id, 3)).toHaveLength(3);
    });
  });

  describe("loadMany", () => {
    it("loads multiple memories by ids", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.save({ content: "C", memoryType: MemoryType.Fact });
      expect(repo.loadMany([a.id, b.id])).toHaveLength(2);
    });

    it("excludes forgotten memories", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.forget(b.id);
      expect(repo.loadMany([a.id, b.id])).toHaveLength(1);
    });
  });

  describe("mergeMemories", () => {
    it("merges two memories into one", () => {
      const a = repo.save({
        content: "First",
        memoryType: MemoryType.Fact,
        importance: 0.5,
      });
      const b = repo.save({
        content: "Second",
        memoryType: MemoryType.Fact,
        importance: 0.8,
      });

      repo.mergeMemories(a.id, b.id, "First\n\nSecond", 0.8, b.accessCount);

      const merged = repo.load(a.id)!;
      expect(merged.content).toBe("First\n\nSecond");
      expect(merged.importance).toBe(0.8);
      expect(repo.load(b.id)).toBeNull();
    });

    it("rewires associations after merge", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "C", memoryType: MemoryType.Fact });
      repo.createAssociation(b.id, {
        targetId: c.id,
        relationType: RelationType.RelatedTo,
      });

      repo.mergeMemories(a.id, b.id, "A\n\nB", 0.6, 0);

      const assocs = repo.getAssociations(a.id);
      expect(assocs.length).toBeGreaterThanOrEqual(1);
      expect(
        assocs.some((x) => x.targetId === c.id || x.sourceId === c.id),
      ).toBe(true);
    });

    it("cleans up merged memory embedding", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      repo.saveEmbedding(a.id, new Float32Array([1, 0, 0, 0]));
      repo.saveEmbedding(b.id, new Float32Array([0, 1, 0, 0]));

      repo.mergeMemories(a.id, b.id, "A\n\nB", 0.6, 0);

      expect(repo.hasEmbedding(a.id)).toBe(true);
      expect(repo.hasEmbedding(b.id)).toBe(false);
    });
  });

  describe("vector operations", () => {
    it("saves and searches embeddings", () => {
      const a = repo.save({ content: "TypeScript", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "Python", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "Rust", memoryType: MemoryType.Fact });

      repo.saveEmbedding(a.id, new Float32Array([1, 0, 0, 0]));
      repo.saveEmbedding(b.id, new Float32Array([0.9, 0.1, 0, 0]));
      repo.saveEmbedding(c.id, new Float32Array([0, 0, 0, 1]));

      const results = repo.searchVector(new Float32Array([1, 0, 0, 0]), 3);

      expect(results).toHaveLength(3);
      expect(results[0].memory_id).toBe(a.id);
      expect(results[0].distance).toBe(0);
      expect(results[1].memory_id).toBe(b.id);
      expect(results[1].distance).toBeGreaterThan(0);
      expect(results[2].memory_id).toBe(c.id);
    });

    it("respects k limit", () => {
      const a = repo.save({ content: "A", memoryType: MemoryType.Fact });
      const b = repo.save({ content: "B", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "C", memoryType: MemoryType.Fact });

      repo.saveEmbedding(a.id, new Float32Array([1, 0, 0, 0]));
      repo.saveEmbedding(b.id, new Float32Array([0.9, 0.1, 0, 0]));
      repo.saveEmbedding(c.id, new Float32Array([0, 0, 0, 1]));

      const results = repo.searchVector(new Float32Array([1, 0, 0, 0]), 2);
      expect(results).toHaveLength(2);
    });

    it("returns empty when no embeddings exist", () => {
      repo.save({ content: "no vec", memoryType: MemoryType.Fact });
      const results = repo.searchVector(new Float32Array([1, 0, 0, 0]), 5);
      expect(results).toHaveLength(0);
    });

    it("hasEmbedding returns correct status", () => {
      const memory = repo.save({ content: "test", memoryType: MemoryType.Fact });
      expect(repo.hasEmbedding(memory.id)).toBe(false);
      repo.saveEmbedding(memory.id, new Float32Array([1, 2, 3, 4]));
      expect(repo.hasEmbedding(memory.id)).toBe(true);
    });

    it("deleteEmbedding removes the vector", () => {
      const memory = repo.save({ content: "test", memoryType: MemoryType.Fact });
      repo.saveEmbedding(memory.id, new Float32Array([1, 2, 3, 4]));
      repo.deleteEmbedding(memory.id);
      expect(repo.hasEmbedding(memory.id)).toBe(false);
    });

    it("saveEmbedding overwrites existing embedding", () => {
      const memory = repo.save({ content: "test", memoryType: MemoryType.Fact });
      repo.saveEmbedding(memory.id, new Float32Array([1, 0, 0, 0]));
      repo.saveEmbedding(memory.id, new Float32Array([0, 0, 0, 1]));

      const results = repo.searchVector(new Float32Array([0, 0, 0, 1]), 1);
      expect(results[0].memory_id).toBe(memory.id);
      expect(results[0].distance).toBe(0);
    });

    it("deleteEmbedding is safe for non-existent memory", () => {
      expect(() => repo.deleteEmbedding("nonexistent")).not.toThrow();
    });
  });

  describe("count", () => {
    it("counts active memories", () => {
      repo.save({ content: "a", memoryType: MemoryType.Fact });
      repo.save({ content: "b", memoryType: MemoryType.Fact });
      const c = repo.save({ content: "c", memoryType: MemoryType.Fact });
      repo.forget(c.id);
      expect(repo.count()).toBe(2);
      expect(repo.count(true)).toBe(3);
    });
  });
});
