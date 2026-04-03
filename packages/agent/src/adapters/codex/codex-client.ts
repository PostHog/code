/**
 * ACP Client implementation for communicating with codex-acp subprocess.
 *
 * This acts as the "client" from codex-acp's perspective: it receives
 * permission requests, session updates, file I/O, and terminal operations
 * from codex-acp and delegates them to the upstream PostHog Code client.
 */

import type {
  AgentSideConnection,
  Client,
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  TerminalHandle,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type { Logger } from "../../utils/logger";
import type { CodexSessionState } from "./session-state";

export interface CodexClientCallbacks {
  /** Called when a usage_update session notification is received */
  onUsageUpdate?: (update: Record<string, unknown>) => void;
}

/**
 * Creates an ACP Client that delegates all requests from codex-acp
 * to the upstream PostHog Code client (via AgentSideConnection).
 */
export function createCodexClient(
  upstreamClient: AgentSideConnection,
  logger: Logger,
  sessionState: CodexSessionState,
  callbacks?: CodexClientCallbacks,
): Client {
  // Track terminal handles for delegation
  const terminalHandles = new Map<string, TerminalHandle>();

  return {
    async requestPermission(
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> {
      logger.debug("Relaying permission request to upstream", {
        sessionId: params.sessionId,
      });
      return upstreamClient.requestPermission(params);
    },

    async sessionUpdate(params: SessionNotification): Promise<void> {
      const update = params.update as Record<string, unknown> | undefined;
      if (update?.sessionUpdate === "usage_update") {
        const used = update.used as number | undefined;
        const size = update.size as number | undefined;
        if (used !== undefined) sessionState.contextUsed = used;
        if (size !== undefined) sessionState.contextSize = size;

        // Accumulate per-message token usage when available
        const inputTokens = update.inputTokens as number | undefined;
        const outputTokens = update.outputTokens as number | undefined;
        if (inputTokens !== undefined) {
          sessionState.accumulatedUsage.inputTokens += inputTokens;
        }
        if (outputTokens !== undefined) {
          sessionState.accumulatedUsage.outputTokens += outputTokens;
        }
        const cachedRead = update.cachedReadTokens as number | undefined;
        const cachedWrite = update.cachedWriteTokens as number | undefined;
        if (cachedRead !== undefined) {
          sessionState.accumulatedUsage.cachedReadTokens += cachedRead;
        }
        if (cachedWrite !== undefined) {
          sessionState.accumulatedUsage.cachedWriteTokens += cachedWrite;
        }

        callbacks?.onUsageUpdate?.(update);
      }

      await upstreamClient.sessionUpdate(params);
    },

    async readTextFile(
      params: ReadTextFileRequest,
    ): Promise<ReadTextFileResponse> {
      return upstreamClient.readTextFile(params);
    },

    async writeTextFile(
      params: WriteTextFileRequest,
    ): Promise<WriteTextFileResponse> {
      return upstreamClient.writeTextFile(params);
    },

    async createTerminal(
      params: CreateTerminalRequest,
    ): Promise<CreateTerminalResponse> {
      const handle = await upstreamClient.createTerminal(params);
      terminalHandles.set(handle.id, handle);
      return { terminalId: handle.id };
    },

    async terminalOutput(
      params: TerminalOutputRequest,
    ): Promise<TerminalOutputResponse> {
      const handle = terminalHandles.get(params.terminalId);
      if (!handle) {
        return { output: "", truncated: false };
      }
      return handle.currentOutput();
    },

    async releaseTerminal(
      params: ReleaseTerminalRequest,
    ): Promise<ReleaseTerminalResponse | undefined> {
      const handle = terminalHandles.get(params.terminalId);
      if (handle) {
        terminalHandles.delete(params.terminalId);
        const result = await handle.release();
        return result ?? undefined;
      }
    },

    async waitForTerminalExit(
      params: WaitForTerminalExitRequest,
    ): Promise<WaitForTerminalExitResponse> {
      const handle = terminalHandles.get(params.terminalId);
      if (!handle) {
        return { exitCode: 1 };
      }
      return handle.waitForExit();
    },

    async killTerminal(
      params: KillTerminalRequest,
    ): Promise<KillTerminalResponse | undefined> {
      const handle = terminalHandles.get(params.terminalId);
      if (handle) {
        return handle.kill();
      }
    },

    async extMethod(
      method: string,
      params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      return upstreamClient.extMethod(method, params);
    },

    async extNotification(
      method: string,
      params: Record<string, unknown>,
    ): Promise<void> {
      return upstreamClient.extNotification(method, params);
    },
  };
}
