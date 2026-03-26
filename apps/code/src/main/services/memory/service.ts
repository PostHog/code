import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AgentMemoryService } from "@posthog/agent/memory";
import { seedMemories } from "@posthog/agent/memory/seed";
import type {
  Association,
  Memory,
  MemorySearchResult,
  MemoryType,
} from "@posthog/agent/memory/types";
import { app } from "electron";
import { injectable, postConstruct, preDestroy } from "inversify";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";

const log = logger.scope("memory");

const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DECAY_RATE = 0.02;
const DECAY_MIN_AGE_DAYS = 1;
const PRUNE_THRESHOLD = 0.1;
const PRUNE_MIN_AGE_DAYS = 30;

function getDataDir(): string {
  return join(app.getPath("userData"), "memory");
}

export const MemoryServiceEvent = {
  Changed: "changed",
} as const;

export type MemoryServiceEvents = {
  [MemoryServiceEvent.Changed]: { timestamp: number };
};

@injectable()
export class MemoryService extends TypedEventEmitter<MemoryServiceEvents> {
  private svc: AgentMemoryService | null = null;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;

  @postConstruct()
  initialize(): void {
    const dataDir = getDataDir();
    log.info("Initializing memory service", { dataDir });
    this.svc = new AgentMemoryService({ dataDir });
    log.info("Memory service ready", { count: this.svc.count() });

    this.runMaintenance();
    this.maintenanceTimer = setInterval(
      () => this.runMaintenance(),
      MAINTENANCE_INTERVAL_MS,
    );
  }

  get service(): AgentMemoryService {
    if (!this.svc) {
      throw new Error("MemoryService not initialized");
    }
    return this.svc;
  }

  async seed(): Promise<number> {
    log.info("Seeding memory database");
    this.close();
    const dataDir = getDataDir();
    const seeded = await seedMemories({ dataDir });
    const count = seeded.count();
    seeded.close();
    this.svc = new AgentMemoryService({ dataDir });
    log.info("Seed complete", { count });
    return count;
  }

  reset(): void {
    log.info("Resetting memory database");
    this.close();
    const dataDir = getDataDir();
    const dbPath = join(dataDir, "knowledge.db");
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (existsSync(p)) rmSync(p);
    }
    this.svc = new AgentMemoryService({ dataDir });
    log.info("Memory database reset");
  }

  count(): number {
    return this.service.count();
  }

  list(options?: {
    memoryType?: string;
    limit?: number;
    includeForgotten?: boolean;
  }): Memory[] {
    const svc = this.service;
    if (options?.memoryType) {
      return svc.getByType(
        options.memoryType as MemoryType,
        options.limit ?? 100,
      );
    }
    return svc.getSorted("recent", { limit: options?.limit ?? 100 });
  }

  search(query: string, limit?: number): MemorySearchResult[] {
    return this.service.searchFts(query, limit);
  }

  getAssociations(memoryId: string): Association[] {
    return this.service.getAssociations(memoryId);
  }

  getGraph(options?: { limit?: number; memoryType?: string }): {
    nodes: Memory[];
    edges: Association[];
  } {
    const svc = this.service;
    const limit = options?.limit ?? 200;

    let nodes: Memory[];
    if (options?.memoryType) {
      nodes = svc.getByType(options.memoryType as MemoryType, limit);
    } else {
      nodes = svc.getSorted("importance", { limit });
    }

    const nodeIds = nodes.map((n) => n.id);
    const edges = svc.getAssociationsBetween(nodeIds);

    return { nodes, edges };
  }

  runMaintenance(): { decayed: number; pruned: number; consolidated: number } {
    try {
      const decayed = this.service.decayImportance(
        DECAY_RATE,
        DECAY_MIN_AGE_DAYS,
      );
      const pruned = this.service.prune(PRUNE_THRESHOLD, PRUNE_MIN_AGE_DAYS);
      const consolidated = this.service.consolidate();
      const total = this.service.count();
      log.info("Memory maintenance complete", {
        decayed,
        pruned,
        consolidated,
        total,
      });
      return { decayed, pruned, consolidated };
    } catch (error) {
      log.error("Memory maintenance failed", { error });
      return { decayed: 0, pruned: 0, consolidated: 0 };
    }
  }

  @preDestroy()
  close(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    if (this.svc) {
      log.info("Closing memory service");
      this.svc.close();
      this.svc = null;
    }
  }
}
