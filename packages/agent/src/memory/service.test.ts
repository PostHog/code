import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMemoryService } from "./service";
import { MemoryType, RelationType } from "./types";

function createTmpDir(): string {
  const dir = join(tmpdir(), `memory-svc-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("AgentMemoryService", () => {
  let svc: AgentMemoryService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    svc = new AgentMemoryService({
      dataDir: tmpDir,
    });
  });

  afterEach(() => {
    svc.close();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("save dedup", () => {
    it("returns existing memory on exact duplicate", () => {
      const first = svc.save({
        content: "User likes dark mode",
        memoryType: MemoryType.Preference,
      });
      const second = svc.save({
        content: "User likes dark mode",
        memoryType: MemoryType.Preference,
      });

      expect(second.id).toBe(first.id);
      expect(svc.count()).toBe(1);
    });

    it("bumps access count on duplicate", () => {
      svc.save({
        content: "User likes dark mode",
        memoryType: MemoryType.Preference,
      });
      svc.save({
        content: "User likes dark mode",
        memoryType: MemoryType.Preference,
      });

      const loaded = svc.load(svc.getSorted("recent")[0].id)!;
      expect(loaded.accessCount).toBe(1);
    });

    it("does not dedup across different types", () => {
      svc.save({
        content: "dark mode",
        memoryType: MemoryType.Preference,
      });
      svc.save({ content: "dark mode", memoryType: MemoryType.Fact });

      expect(svc.count()).toBe(2);
    });

    it("auto-links related memories of same type", () => {
      const first = svc.save({
        content: "User prefers TypeScript strict mode",
        memoryType: MemoryType.Preference,
      });
      const second = svc.save({
        content: "TypeScript",
        memoryType: MemoryType.Preference,
      });

      const assocs = svc.getAssociations(second.id);
      expect(
        assocs.some((a) => a.targetId === first.id || a.sourceId === first.id),
      ).toBe(true);
    });
  });

  describe("recall", () => {
    it("increments access count on recall", () => {
      const memory = svc.save({
        content: "fact",
        memoryType: MemoryType.Fact,
      });

      svc.recall(memory.id);
      svc.recall(memory.id);
      svc.recall(memory.id);

      const loaded = svc.load(memory.id)!;
      expect(loaded.accessCount).toBe(3);
    });

    it("returns null for missing id", () => {
      expect(svc.recall("nonexistent")).toBeNull();
    });
  });

  describe("searchFts", () => {
    it("finds memories by full-text search", () => {
      svc.save({
        content: "TypeScript rocks",
        memoryType: MemoryType.Preference,
      });
      svc.save({
        content: "Something totally different xyz",
        memoryType: MemoryType.Fact,
      });

      const results = svc.searchFts("TypeScript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.content).toBe("TypeScript rocks");
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].rank).toBe(1);
    });

    it("excludes forgotten memories from results", () => {
      const mem = svc.save({
        content: "forget me please",
        memoryType: MemoryType.Fact,
      });
      svc.forget(mem.id);
      const results = svc.searchFts("forget");
      expect(results.every((r) => r.memory.id !== mem.id)).toBe(true);
    });
  });

  describe("merge", () => {
    it("combines content and takes max importance", () => {
      const a = svc.save({
        content: "Version 1",
        memoryType: MemoryType.Fact,
        importance: 0.4,
      });
      const b = svc.save({
        content: "Version 2",
        memoryType: MemoryType.Fact,
        importance: 0.9,
      });

      const merged = svc.merge(a.id, b.id);

      expect(merged).not.toBeNull();
      expect(merged?.content).toContain("Version 1");
      expect(merged?.content).toContain("Version 2");
      expect(merged?.importance).toBe(0.9);
      expect(svc.load(b.id)).toBeNull();
      expect(svc.count()).toBe(1);
    });

    it("returns null when either id is missing", () => {
      const a = svc.save({
        content: "A",
        memoryType: MemoryType.Fact,
      });
      expect(svc.merge(a.id, "missing")).toBeNull();
      expect(svc.merge("missing", a.id)).toBeNull();
    });

    it("preserves associations from merged memory", () => {
      const a = svc.save({
        content: "A",
        memoryType: MemoryType.Fact,
      });
      const b = svc.save({
        content: "B",
        memoryType: MemoryType.Fact,
      });
      const c = svc.save({
        content: "C",
        memoryType: MemoryType.Fact,
      });
      svc.link(b.id, {
        targetId: c.id,
        relationType: RelationType.RelatedTo,
      });

      svc.merge(a.id, b.id);

      const assocs = svc.getAssociations(a.id);
      expect(
        assocs.some((x) => x.targetId === c.id || x.sourceId === c.id),
      ).toBe(true);
    });

    it("merged content is searchable via FTS", () => {
      const a = svc.save({
        content: "First",
        memoryType: MemoryType.Fact,
      });
      const b = svc.save({
        content: "Second",
        memoryType: MemoryType.Fact,
      });

      svc.merge(a.id, b.id);

      const results = svc.searchFts("Second");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.id).toBe(a.id);
    });
  });

  describe("getNeighbors", () => {
    it("returns loaded memories from graph traversal", () => {
      const a = svc.save({
        content: "A",
        memoryType: MemoryType.Fact,
      });
      const b = svc.save({
        content: "B",
        memoryType: MemoryType.Fact,
      });
      const c = svc.save({
        content: "C",
        memoryType: MemoryType.Fact,
      });
      svc.link(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      svc.link(b.id, {
        targetId: c.id,
        relationType: RelationType.RelatedTo,
      });

      const neighbors = svc.getNeighbors(a.id, 2);
      expect(neighbors).toHaveLength(2);
      expect(neighbors.map((n) => n.content).sort()).toEqual(["B", "C"]);
    });

    it("excludes forgotten neighbors", () => {
      const a = svc.save({
        content: "A",
        memoryType: MemoryType.Fact,
      });
      const b = svc.save({
        content: "B",
        memoryType: MemoryType.Fact,
      });
      svc.link(a.id, {
        targetId: b.id,
        relationType: RelationType.RelatedTo,
      });
      svc.forget(b.id);

      expect(svc.getNeighbors(a.id, 1)).toHaveLength(0);
    });
  });

  describe("decayImportance", () => {
    it("skips identity memories", () => {
      const identity = svc.save({
        content: "I am Charles",
        memoryType: MemoryType.Identity,
      });

      const decayed = svc.decayImportance(0.05, 0);

      const loaded = svc.load(identity.id)!;
      expect(loaded.importance).toBe(1.0);
      expect(decayed).toBe(0);
    });

    it("reduces importance of old memories", () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      vi.setSystemTime(twoDaysAgo);
      const memory = svc.save({
        content: "old fact",
        memoryType: MemoryType.Fact,
        importance: 0.8,
      });
      vi.useRealTimers();

      const decayed = svc.decayImportance(0.05, 1);

      expect(decayed).toBe(1);
      const loaded = svc.load(memory.id)!;
      expect(loaded.importance).toBeLessThan(0.8);
    });

    it("skips memories younger than minAgeDays", () => {
      svc.save({
        content: "fresh fact",
        memoryType: MemoryType.Fact,
        importance: 0.8,
      });

      const decayed = svc.decayImportance(0.05, 30);
      expect(decayed).toBe(0);
    });
  });

  describe("prune", () => {
    it("deletes low-importance old memories", () => {
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      vi.setSystemTime(sixtyDaysAgo);
      const memory = svc.save({
        content: "low",
        memoryType: MemoryType.Observation,
        importance: 0.05,
      });
      vi.useRealTimers();

      const pruned = svc.prune(0.1, 30);

      expect(pruned).toBe(1);
      expect(svc.load(memory.id)).toBeNull();
    });

    it("preserves identity memories regardless of importance", () => {
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      vi.setSystemTime(sixtyDaysAgo);
      const identity = svc.save({
        content: "core identity",
        memoryType: MemoryType.Identity,
        importance: 0.01,
      });
      vi.useRealTimers();

      const pruned = svc.prune(0.1, 30);

      expect(pruned).toBe(0);
      expect(svc.load(identity.id)).not.toBeNull();
    });

    it("preserves recent low-importance memories", () => {
      svc.save({
        content: "recent low",
        memoryType: MemoryType.Observation,
        importance: 0.05,
      });

      const pruned = svc.prune(0.1, 30);
      expect(pruned).toBe(0);
      expect(svc.count()).toBe(1);
    });
  });
});
