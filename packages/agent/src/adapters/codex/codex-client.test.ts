import type {
  AgentSideConnection,
  ReadTextFileRequest,
  ReadTextFileResponse,
} from "@agentclientprotocol/sdk";
import { describe, expect, test, vi } from "vitest";
import type { FileEnrichmentDeps } from "../../enrichment/file-enricher";
import { Logger } from "../../utils/logger";

const enrichFileMock = vi.hoisted(() => vi.fn());
vi.mock("../../enrichment/file-enricher", () => ({
  enrichFileForAgent: enrichFileMock,
}));

import { createCodexClient } from "./codex-client";
import { createSessionState } from "./session-state";

function makeUpstream(response: ReadTextFileResponse): AgentSideConnection & {
  readTextFile: ReturnType<typeof vi.fn>;
} {
  const mock = {
    readTextFile: vi.fn(async (_: ReadTextFileRequest) => response),
    writeTextFile: vi.fn(),
    requestPermission: vi.fn(),
    sessionUpdate: vi.fn(),
    createTerminal: vi.fn(),
    terminalOutput: vi.fn(),
    releaseTerminal: vi.fn(),
    waitForTerminalExit: vi.fn(),
    killTerminal: vi.fn(),
    extMethod: vi.fn(),
    extNotification: vi.fn(),
  };
  return mock as unknown as AgentSideConnection & {
    readTextFile: ReturnType<typeof vi.fn>;
  };
}

describe("createCodexClient readTextFile", () => {
  const logger = new Logger({ debug: false, prefix: "[test]" });
  const sessionState = createSessionState("", "/tmp");

  test("returns upstream response unchanged when enrichmentDeps is absent", async () => {
    enrichFileMock.mockReset();
    const upstream = makeUpstream({ content: "const x = 1;" });
    const client = createCodexClient(upstream, logger, sessionState);

    const result = await client.readTextFile?.({
      sessionId: "s",
      path: "/tmp/a.ts",
    });
    expect(result?.content).toBe("const x = 1;");
    expect(enrichFileMock).not.toHaveBeenCalled();
  });

  test("returns enriched content when helper returns a string", async () => {
    enrichFileMock.mockReset();
    enrichFileMock.mockResolvedValueOnce("const x = 1; // [PostHog] Flag ...");

    const upstream = makeUpstream({ content: "const x = 1;" });
    const deps = {} as FileEnrichmentDeps;
    const client = createCodexClient(upstream, logger, sessionState, {
      enrichmentDeps: deps,
    });

    const result = await client.readTextFile?.({
      sessionId: "s",
      path: "/tmp/a.ts",
    });
    expect(result?.content).toBe("const x = 1; // [PostHog] Flag ...");
    expect(enrichFileMock).toHaveBeenCalledWith(
      deps,
      "/tmp/a.ts",
      "const x = 1;",
    );
  });

  test("falls back to upstream response when helper returns null", async () => {
    enrichFileMock.mockReset();
    enrichFileMock.mockResolvedValueOnce(null);

    const upstream = makeUpstream({ content: "no posthog here" });
    const client = createCodexClient(upstream, logger, sessionState, {
      enrichmentDeps: {} as FileEnrichmentDeps,
    });

    const result = await client.readTextFile?.({
      sessionId: "s",
      path: "/tmp/a.ts",
    });
    expect(result?.content).toBe("no posthog here");
  });

  test("calls upstream.readTextFile with original params (UI sees original)", async () => {
    enrichFileMock.mockReset();
    enrichFileMock.mockResolvedValueOnce("enriched");

    const upstream = makeUpstream({ content: "original" });
    const client = createCodexClient(upstream, logger, sessionState, {
      enrichmentDeps: {} as FileEnrichmentDeps,
    });

    const params = {
      sessionId: "s",
      path: "/tmp/a.ts",
      line: 10,
      limit: 5,
    };
    await client.readTextFile?.(params);
    expect(upstream.readTextFile).toHaveBeenCalledWith(params);
  });
});
