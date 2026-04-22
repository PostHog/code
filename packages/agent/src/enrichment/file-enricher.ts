import * as path from "node:path";
import { EXT_TO_LANG_ID, PostHogEnricher } from "@posthog/enricher";
import type { PostHogAPIConfig } from "../types";
import type { Logger } from "../utils/logger";

export interface FileEnrichmentDeps {
  enricher: PostHogEnricher;
  apiConfig: PostHogAPIConfig;
  logger?: Logger;
}

export interface Enrichment {
  deps: FileEnrichmentDeps;
  dispose(): void;
}

export function createEnrichment(
  apiConfig: PostHogAPIConfig | undefined,
  logger?: Logger,
): Enrichment | undefined {
  if (!apiConfig) return undefined;
  const enricher = new PostHogEnricher();
  return {
    deps: { enricher, apiConfig, logger },
    dispose: () => enricher.dispose(),
  };
}

const MAX_ENRICHMENT_BYTES = 1_000_000;

export async function enrichFileForAgent(
  deps: FileEnrichmentDeps,
  filePath: string,
  content: string,
): Promise<string | null> {
  if (!content || content.length > MAX_ENRICHMENT_BYTES) return null;

  // Skip the tree-sitter parse for files with no PostHog references.
  if (!/posthog/i.test(content)) return null;

  const ext = path.extname(filePath).toLowerCase();
  const langId = EXT_TO_LANG_ID[ext];
  if (!langId || !deps.enricher.isSupported(langId)) return null;

  try {
    const parsed = await deps.enricher.parse(content, langId);
    if (parsed.calls.length === 0 && parsed.initCalls.length === 0) {
      return null;
    }

    const apiKey = await deps.apiConfig.getApiKey();
    if (!apiKey) return null;

    const enriched = await parsed.enrichFromApi({
      apiKey,
      host: deps.apiConfig.apiUrl,
      projectId: deps.apiConfig.projectId,
      timeoutMs: 5_000,
    });

    const annotated = enriched.toInlineComments();
    if (annotated === content) {
      deps.logger?.debug("File enrichment produced no changes", {
        filePath,
        calls: parsed.calls.length,
      });
      return null;
    }
    deps.logger?.debug("File enriched", {
      filePath,
      calls: parsed.calls.length,
    });
    return annotated;
  } catch (err) {
    const detail =
      err instanceof Error
        ? { message: err.message, name: err.name, stack: err.stack }
        : { value: String(err) };
    deps.logger?.debug("File enrichment failed", { filePath, ...detail });
    return null;
  }
}
