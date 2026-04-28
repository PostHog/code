import { createHash } from "node:crypto";
import {
  enrichSource,
  PostHogEnricher,
  type SerializedEnrichment,
  setLogger as setEnricherLogger,
  toSerializable,
} from "@posthog/enricher";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import type { AuthService } from "../auth/service";

const log = logger.scope("enrichment-service");

setEnricherLogger({
  warn: (message, ...args) => log.warn(message, ...args),
});

const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  value: SerializedEnrichment | null;
  expiresAt: number;
}

export interface EnrichFileInput {
  taskId: string;
  filePath: string;
  absolutePath?: string;
  content: string;
}

@injectable()
export class EnrichmentService {
  private enricher: PostHogEnricher | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly authService: AuthService,
  ) {}

  async enrichFile(
    input: EnrichFileInput,
  ): Promise<SerializedEnrichment | null> {
    const { taskId, filePath, absolutePath, content } = input;
    const cacheKey = this.buildCacheKey(taskId, filePath, content);

    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.value;
    }
    if (cached) {
      this.cache.delete(cacheKey);
    }

    const result = await this.runEnrichment(filePath, absolutePath, content);
    this.setCache(cacheKey, result);
    return result;
  }

  private async runEnrichment(
    filePath: string,
    absolutePath: string | undefined,
    content: string,
  ): Promise<SerializedEnrichment | null> {
    const state = this.authService.getState();
    if (
      state.status !== "authenticated" ||
      !state.projectId ||
      !state.cloudRegion
    ) {
      return null;
    }

    let apiKey: string;
    let apiHost: string;
    try {
      const auth = await this.authService.getValidAccessToken();
      apiKey = auth.accessToken;
      apiHost = auth.apiHost;
    } catch (err) {
      log.debug("Failed to resolve access token for enrichment", {
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const enricher = this.getEnricher();
    const enriched = await enrichSource({
      enricher,
      apiConfig: {
        apiKey,
        host: apiHost,
        projectId: state.projectId,
      },
      filePath,
      absolutePath,
      content,
      onDebug: (message: string, data?: Record<string, unknown>) => {
        log.debug(message, { filePath, ...(data ?? {}) });
      },
    });

    if (!enriched) return null;
    return toSerializable(enriched);
  }

  private getEnricher(): PostHogEnricher {
    if (!this.enricher) {
      this.enricher = new PostHogEnricher();
    }
    return this.enricher;
  }

  private buildCacheKey(
    taskId: string,
    filePath: string,
    content: string,
  ): string {
    const hash = createHash("sha1").update(content).digest("hex");
    return `${taskId}::${filePath}::${hash}`;
  }

  private setCache(key: string, value: SerializedEnrichment | null): void {
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  dispose(): void {
    this.enricher?.dispose();
    this.enricher = null;
    this.cache.clear();
  }
}
