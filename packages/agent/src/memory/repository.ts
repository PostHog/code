import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Logger } from "../utils/logger";
import {
  type Association,
  type CreateAssociationInput,
  type CreateMemoryInput,
  type VectorSearchResult,
  clampImportance,
  clampWeight,
  DEFAULT_IMPORTANCE,
  type Memory,
  type MemoryType,
  type SortOrder,
} from "./types";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  importance REAL DEFAULT 0.5,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_accessed_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0,
  source TEXT,
  forgotten INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

CREATE TABLE IF NOT EXISTS associations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
  UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_associations_source ON associations(source_id);
CREATE INDEX IF NOT EXISTS idx_associations_target ON associations(target_id);

CREATE TABLE IF NOT EXISTS vec_map (
  vec_rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE
);

`;

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    content: row.content as string,
    memoryType: row.memory_type as MemoryType,
    importance: row.importance as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastAccessedAt: row.last_accessed_at as string,
    accessCount: row.access_count as number,
    source: (row.source as string) ?? null,
    forgotten: (row.forgotten as number) === 1,
  };
}

function rowToAssociation(row: Record<string, unknown>): Association {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    targetId: row.target_id as string,
    relationType: row.relation_type as Association["relationType"],
    weight: row.weight as number,
    createdAt: row.created_at as string,
  };
}

export const DEFAULT_VECTOR_DIMENSIONS = 384;

export interface MemoryRepositoryOptions {
  dbPath: string;
  logger?: Logger;
  vectorDimensions?: number;
}

export class AgentMemoryRepository {
  private db: DatabaseType;
  private logger?: Logger;
  private vectorDimensions: number;

  constructor(options: MemoryRepositoryOptions) {
    this.logger = options.logger;
    this.vectorDimensions = options.vectorDimensions ?? DEFAULT_VECTOR_DIMENSIONS;

    mkdirSync(dirname(options.dbPath), { recursive: true });

    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    sqliteVec.load(this.db);

    this.db.exec(SCHEMA_SQL);
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(embedding float[${this.vectorDimensions}])`,
    );

    this.logger?.debug("Memory repository initialized", {
      path: options.dbPath,
      vectorDimensions: this.vectorDimensions,
    });
  }

  save(input: CreateMemoryInput): Memory {
    const id = randomUUID();
    const now = new Date().toISOString();
    const importance = clampImportance(
      input.importance ?? DEFAULT_IMPORTANCE[input.memoryType],
    );

    this.db
      .prepare(
        `INSERT INTO memories (id, content, memory_type, importance, created_at, updated_at, last_accessed_at, access_count, source, forgotten)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0)`,
      )
      .run(
        id,
        input.content,
        input.memoryType,
        importance,
        now,
        now,
        now,
        input.source ?? null,
      );

    if (input.associations?.length) {
      for (const assoc of input.associations) {
        this.createAssociation(id, assoc);
      }
    }

    return {
      id,
      content: input.content,
      memoryType: input.memoryType,
      importance,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      source: input.source ?? null,
      forgotten: false,
    };
  }

  load(id: string): Memory | null {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToMemory(row) : null;
  }

  update(memory: Memory): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE memories
       SET content = ?, memory_type = ?, importance = ?, updated_at = ?,
           last_accessed_at = ?, access_count = ?, source = ?, forgotten = ?
       WHERE id = ?`,
      )
      .run(
        memory.content,
        memory.memoryType,
        clampImportance(memory.importance),
        now,
        memory.lastAccessedAt,
        memory.accessCount,
        memory.source,
        memory.forgotten ? 1 : 0,
        memory.id,
      );
  }

  delete(id: string): boolean {
    this.deleteEmbedding(id);
    return (
      this.db.prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0
    );
  }

  recordAccess(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
      )
      .run(now, id);
  }

  forget(id: string): boolean {
    const now = new Date().toISOString();
    return (
      this.db
        .prepare(
          "UPDATE memories SET forgotten = 1, updated_at = ? WHERE id = ? AND forgotten = 0",
        )
        .run(now, id).changes > 0
    );
  }

  createAssociation(
    sourceId: string,
    input: CreateAssociationInput,
  ): Association {
    const id = randomUUID();
    const now = new Date().toISOString();
    const weight = clampWeight(input.weight ?? 0.5);

    this.db
      .prepare(
        `INSERT INTO associations (id, source_id, target_id, relation_type, weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET weight = excluded.weight`,
      )
      .run(id, sourceId, input.targetId, input.relationType, weight, now);

    return {
      id,
      sourceId,
      targetId: input.targetId,
      relationType: input.relationType,
      weight,
      createdAt: now,
    };
  }

  getAssociations(memoryId: string): Association[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM associations WHERE source_id = ? OR target_id = ?",
        )
        .all(memoryId, memoryId) as Record<string, unknown>[]
    ).map(rowToAssociation);
  }

  deleteAssociationsForMemory(memoryId: string): number {
    return this.db
      .prepare("DELETE FROM associations WHERE source_id = ? OR target_id = ?")
      .run(memoryId, memoryId).changes;
  }

  getAssociationsBetween(memoryIds: string[]): Association[] {
    if (memoryIds.length === 0) return [];
    const placeholders = memoryIds.map(() => "?").join(",");
    return (
      this.db
        .prepare(
          `SELECT * FROM associations
         WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})`,
        )
        .all(...memoryIds, ...memoryIds) as Record<string, unknown>[]
    ).map(rowToAssociation);
  }

  getByType(
    memoryType: MemoryType,
    limit = 50,
    includeForgotten = false,
  ): Memory[] {
    const forgottenClause = includeForgotten ? "" : "AND forgotten = 0";
    return (
      this.db
        .prepare(
          `SELECT * FROM memories WHERE memory_type = ? ${forgottenClause}
         ORDER BY importance DESC, updated_at DESC LIMIT ?`,
        )
        .all(memoryType, limit) as Record<string, unknown>[]
    ).map(rowToMemory);
  }

  getHighImportance(threshold = 0.7, limit = 50): Memory[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM memories WHERE importance >= ? AND forgotten = 0
         ORDER BY importance DESC, updated_at DESC LIMIT ?`,
        )
        .all(threshold, limit) as Record<string, unknown>[]
    ).map(rowToMemory);
  }

  getSorted(
    order: SortOrder,
    options?: { memoryType?: MemoryType; limit?: number },
  ): Memory[] {
    const limit = options?.limit ?? 50;
    const typeClause = options?.memoryType ? "AND memory_type = ?" : "";
    const orderMap = {
      recent: "ORDER BY created_at DESC",
      importance: "ORDER BY importance DESC",
      most_accessed: "ORDER BY access_count DESC",
    } as const;

    const params: unknown[] = [];
    if (options?.memoryType) params.push(options.memoryType);
    params.push(limit);

    return (
      this.db
        .prepare(
          `SELECT * FROM memories WHERE forgotten = 0 ${typeClause} ${orderMap[order]} LIMIT ?`,
        )
        .all(...params) as Record<string, unknown>[]
    ).map(rowToMemory);
  }

  searchText(query: string, limit = 20): Memory[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM memories
         WHERE content LIKE ? AND forgotten = 0
         ORDER BY importance DESC LIMIT ?`,
        )
        .all(`%${query}%`, limit) as Record<string, unknown>[]
    ).map(rowToMemory);
  }

  getNeighborIds(memoryId: string, depth = 2, limit = 50): string[] {
    const visited = new Set<string>([memoryId]);
    let frontier = [memoryId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        for (const assoc of this.getAssociations(nodeId)) {
          const neighborId =
            assoc.sourceId === nodeId ? assoc.targetId : assoc.sourceId;
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }
      frontier = nextFrontier;
    }

    visited.delete(memoryId);
    return [...visited].slice(0, limit);
  }

  loadMany(ids: string[]): Memory[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    return (
      this.db
        .prepare(
          `SELECT * FROM memories WHERE id IN (${placeholders}) AND forgotten = 0`,
        )
        .all(...ids) as Record<string, unknown>[]
    ).map(rowToMemory);
  }

  mergeMemories(
    keepId: string,
    mergeId: string,
    mergedContent: string,
    maxImportance: number,
    mergeAccessCount: number,
  ): boolean {
    const txn = this.db.transaction(() => {
      const mergeAssocs = this.db
        .prepare(
          "SELECT * FROM associations WHERE source_id = ? OR target_id = ?",
        )
        .all(mergeId, mergeId) as Record<string, unknown>[];

      this.db
        .prepare(
          "DELETE FROM associations WHERE source_id = ? OR target_id = ?",
        )
        .run(mergeId, mergeId);

      const upsert = this.db.prepare(
        `INSERT INTO associations (id, source_id, target_id, relation_type, weight, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET weight = MAX(weight, excluded.weight)`,
      );

      for (const row of mergeAssocs) {
        const sourceId =
          (row.source_id as string) === mergeId
            ? keepId
            : (row.source_id as string);
        const targetId =
          (row.target_id as string) === mergeId
            ? keepId
            : (row.target_id as string);
        if (sourceId === targetId) continue;
        upsert.run(
          randomUUID(),
          sourceId,
          targetId,
          row.relation_type,
          row.weight,
          row.created_at,
        );
      }

      const now = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE memories SET content = ?, importance = ?, updated_at = ?, access_count = access_count + ? WHERE id = ?`,
        )
        .run(mergedContent, maxImportance, now, mergeAccessCount, keepId);

      this.deleteEmbedding(mergeId);
      this.db.prepare("DELETE FROM memories WHERE id = ?").run(mergeId);
    });

    txn();
    return true;
  }

  count(includeForgotten = false): number {
    const clause = includeForgotten ? "" : "WHERE forgotten = 0";
    return (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM memories ${clause}`)
        .get() as { count: number }
    ).count;
  }

  saveEmbedding(memoryId: string, embedding: Float32Array): void {
    const txn = this.db.transaction(() => {
      this.db
        .prepare("INSERT OR IGNORE INTO vec_map (memory_id) VALUES (?)")
        .run(memoryId);
      const row = this.db
        .prepare("SELECT vec_rowid FROM vec_map WHERE memory_id = ?")
        .get(memoryId) as { vec_rowid: number };

      this.db
        .prepare(
          `DELETE FROM vec_embeddings WHERE rowid = ${row.vec_rowid}`,
        )
        .run();
      this.db
        .prepare(
          `INSERT INTO vec_embeddings(rowid, embedding) VALUES (${row.vec_rowid}, ?)`,
        )
        .run(Buffer.from(embedding.buffer));
    });
    txn();
  }

  deleteEmbedding(memoryId: string): void {
    const row = this.db
      .prepare("SELECT vec_rowid FROM vec_map WHERE memory_id = ?")
      .get(memoryId) as { vec_rowid: number } | undefined;
    if (!row) return;

    this.db
      .prepare(`DELETE FROM vec_embeddings WHERE rowid = ${row.vec_rowid}`)
      .run();
    this.db.prepare("DELETE FROM vec_map WHERE memory_id = ?").run(memoryId);
  }

  searchVector(query: Float32Array, k = 20): VectorSearchResult[] {
    return this.db
      .prepare(
        `SELECT vm.memory_id, v.distance
         FROM vec_embeddings v
         JOIN vec_map vm ON vm.vec_rowid = v.rowid
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(Buffer.from(query.buffer), k) as VectorSearchResult[];
  }

  hasEmbedding(memoryId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM vec_map WHERE memory_id = ?")
      .get(memoryId);
    return row !== undefined;
  }

  close(): void {
    this.db.close();
    this.logger?.debug("Memory repository closed");
  }
}
