import { describe, expect, test, vi } from "vitest";
import { enrichFileForAgent, type FileEnrichmentDeps } from "./file-enricher";

function makeDeps(overrides: {
  toInlineCommentsReturn?: string;
  callsCount?: number;
  initCallsCount?: number;
  parseRejects?: Error;
  isSupported?: boolean;
  getApiKey?: () => string | Promise<string>;
}): {
  deps: FileEnrichmentDeps;
  parseSpy: ReturnType<typeof vi.fn>;
  enrichFromApiSpy: ReturnType<typeof vi.fn>;
  getApiKeySpy: ReturnType<typeof vi.fn>;
} {
  const enrichFromApiSpy = vi.fn(async () => ({
    toInlineComments: () =>
      overrides.toInlineCommentsReturn ?? "enriched content",
  }));

  const parseSpy = vi.fn(async () => {
    if (overrides.parseRejects) throw overrides.parseRejects;
    return {
      calls: Array.from({ length: overrides.callsCount ?? 1 }),
      initCalls: Array.from({ length: overrides.initCallsCount ?? 0 }),
      enrichFromApi: enrichFromApiSpy,
    };
  });

  const getApiKeySpy = vi.fn(overrides.getApiKey ?? (() => "phx_test"));

  const deps: FileEnrichmentDeps = {
    enricher: {
      isSupported: vi.fn(() => overrides.isSupported ?? true),
      parse: parseSpy,
    } as unknown as FileEnrichmentDeps["enricher"],
    apiConfig: {
      apiUrl: "https://test.posthog.com",
      projectId: 1,
      getApiKey: getApiKeySpy,
    },
  };

  return { deps, parseSpy, enrichFromApiSpy, getApiKeySpy };
}

describe("enrichFileForAgent", () => {
  test("returns null for unsupported extension", async () => {
    const { deps, parseSpy } = makeDeps({});
    const result = await enrichFileForAgent(
      deps,
      "/tmp/notes.txt",
      "some text",
    );
    expect(result).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  test("returns null for empty content", async () => {
    const { deps, parseSpy } = makeDeps({});
    const result = await enrichFileForAgent(deps, "/tmp/code.ts", "");
    expect(result).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  test("returns null for content > 1MB", async () => {
    const { deps, parseSpy } = makeDeps({});
    const huge = "x".repeat(1_000_001);
    const result = await enrichFileForAgent(deps, "/tmp/code.ts", huge);
    expect(result).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  test("returns null when language not supported by enricher", async () => {
    const { deps, parseSpy } = makeDeps({ isSupported: false });
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "posthog.capture('x');",
    );
    expect(result).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  test("returns null when no PostHog calls detected", async () => {
    const { deps, enrichFromApiSpy } = makeDeps({
      callsCount: 0,
      initCallsCount: 0,
    });
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "posthog.capture('x');",
    );
    expect(result).toBeNull();
    expect(enrichFromApiSpy).not.toHaveBeenCalled();
  });

  test("returns null and skips parse when content has no posthog reference", async () => {
    const { deps, parseSpy } = makeDeps({});
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "const x = 1;\nfunction foo() {}",
    );
    expect(result).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  test("returns null when getApiKey yields empty string", async () => {
    const { deps, enrichFromApiSpy } = makeDeps({ getApiKey: () => "" });
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "posthog.capture('x');",
    );
    expect(result).toBeNull();
    expect(enrichFromApiSpy).not.toHaveBeenCalled();
  });

  test("returns null when toInlineComments produces no change", async () => {
    const original = "posthog.capture('x');";
    const { deps } = makeDeps({ toInlineCommentsReturn: original });
    const result = await enrichFileForAgent(deps, "/tmp/code.ts", original);
    expect(result).toBeNull();
  });

  test("returns null and logs debug when enricher throws", async () => {
    const logger = { debug: vi.fn() };
    const { deps } = makeDeps({ parseRejects: new Error("boom") });
    deps.logger = logger as unknown as FileEnrichmentDeps["logger"];
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "posthog.capture('x');",
    );
    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      "File enrichment failed",
      expect.objectContaining({ filePath: "/tmp/code.ts" }),
    );
  });

  test("returns enriched string when happy path completes", async () => {
    const { deps, enrichFromApiSpy } = makeDeps({
      toInlineCommentsReturn: "posthog.capture('x'); // [PostHog] Event: \"x\"",
    });
    const result = await enrichFileForAgent(
      deps,
      "/tmp/code.ts",
      "posthog.capture('x');",
    );
    expect(result).toBe("posthog.capture('x'); // [PostHog] Event: \"x\"");
    expect(enrichFromApiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "phx_test",
        host: "https://test.posthog.com",
        projectId: 1,
      }),
    );
  });
});
