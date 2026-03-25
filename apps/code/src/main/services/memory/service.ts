import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AgentMemoryService } from "@posthog/agent/memory/service";
import { seedMemories } from "@posthog/agent/memory/seed";
import { app } from "electron";
import { injectable, postConstruct, preDestroy } from "inversify";
import { logger } from "../../utils/logger";

const log = logger.scope("memory");

function getDataDir(): string {
  return join(app.getPath("userData"), "memory");
}

@injectable()
export class MemoryService {
  private svc: AgentMemoryService | null = null;

  @postConstruct()
  initialize(): void {
    const dataDir = getDataDir();
    log.info("Initializing memory service", { dataDir });
    this.svc = new AgentMemoryService({ dataDir });
    log.info("Memory service ready", { count: this.svc.count() });
  }

  get service(): AgentMemoryService {
    if (!this.svc) {
      throw new Error("MemoryService not initialized");
    }
    return this.svc;
  }

  seed(): number {
    log.info("Seeding memory database");
    this.close();
    const dataDir = getDataDir();
    const seeded = seedMemories({ dataDir });
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

  @preDestroy()
  close(): void {
    if (this.svc) {
      log.info("Closing memory service");
      this.svc.close();
      this.svc = null;
    }
  }
}
