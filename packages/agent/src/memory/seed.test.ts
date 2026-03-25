import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedMemories } from "./seed";
import type { AgentMemoryService } from "./service";
import { MemoryType } from "./types";

function createTmpDir(): string {
  const dir = join(tmpdir(), `memory-seed-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("seedMemories", () => {
  let svc: AgentMemoryService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTmpDir();
    svc = await seedMemories({ dataDir: tmpDir });
  });

  afterEach(() => {
    svc.close();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates the expected number of memories", () => {
    expect(svc.count()).toBeGreaterThanOrEqual(28);
  });

  it("seeds all memory types", () => {
    for (const type of Object.values(MemoryType)) {
      const memories = svc.getByType(type);
      expect(memories.length).toBeGreaterThan(0);
    }
  });

  it("creates associations between memories", () => {
    const goals = svc.getByType(MemoryType.Goal);
    const hasAssociations = goals.some(
      (g) => svc.getAssociations(g.id).length > 0,
    );
    expect(hasAssociations).toBe(true);
  });

  it("graph traversal reaches multiple nodes", () => {
    const identities = svc.getByType(MemoryType.Identity);
    const root = identities[0];
    const neighbors = svc.getNeighbors(root.id, 3);
    expect(neighbors.length).toBeGreaterThanOrEqual(2);
  });

  it("text search finds seeded content", () => {
    expect(svc.searchText("TypeScript").length).toBeGreaterThan(0);
    expect(svc.searchText("better-sqlite3").length).toBeGreaterThan(0);
    expect(svc.searchText("Biome").length).toBeGreaterThan(0);
  });

  it("is idempotent when run on a fresh directory", async () => {
    const tmpDir2 = createTmpDir();
    const svc2 = await seedMemories({ dataDir: tmpDir2 });
    expect(svc2.count()).toBe(svc.count());
    svc2.close();
    rmSync(tmpDir2, { recursive: true, force: true });
  });
});
