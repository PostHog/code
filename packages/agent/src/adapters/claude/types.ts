import type {
  SessionConfigOption,
  TerminalHandle,
  TerminalOutputResponse,
} from "@agentclientprotocol/sdk";
import type {
  Options,
  Query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Pushable } from "../../utils/streams.js";
import type { BaseSession } from "../base-acp-agent.js";
import type { SettingsManager } from "./session/settings.js";
import type { CodeExecutionMode } from "./tools.js";

export type EffortLevel = "low" | "medium" | "high" | "max";

export type AccumulatedUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
};

export type BackgroundTerminal =
  | {
      handle: TerminalHandle;
      status: "started";
      lastOutput: TerminalOutputResponse | null;
    }
  | {
      status: "aborted" | "exited" | "killed" | "timedOut";
      pendingOutput: TerminalOutputResponse;
    };

export type PendingMessage = {
  resolve: (cancelled: boolean) => void;
  order: number;
};

export type Session = BaseSession & {
  query: Query;
  /** The Options object passed to query() — mutating it affects subsequent prompts */
  queryOptions: Options;
  input: Pushable<SDKUserMessage>;
  settingsManager: SettingsManager;
  permissionMode: CodeExecutionMode;
  modelId?: string;
  cwd: string;
  taskRunId?: string;
  lastPlanFilePath?: string;
  lastPlanContent?: string;
  effort?: EffortLevel;
  configOptions: SessionConfigOption[];
  accumulatedUsage: AccumulatedUsage;
  promptRunning: boolean;
  pendingMessages: Map<string, PendingMessage>;
  nextPendingOrder: number;
};

export type ToolUseCache = {
  [key: string]: {
    type: "tool_use" | "server_tool_use" | "mcp_tool_use";
    id: string;
    name: string;
    input: unknown;
  };
};

export type TerminalInfo = {
  terminal_id: string;
};

export type TerminalOutput = {
  terminal_id: string;
  data: string;
};

export type TerminalExit = {
  terminal_id: string;
  exit_code: number | null;
  signal: string | null;
};

export type ToolUpdateMeta = {
  claudeCode?: {
    toolName: string;
    toolResponse?: unknown;
    parentToolCallId?: string;
  };
  terminal_info?: TerminalInfo;
  terminal_output?: TerminalOutput;
  terminal_exit?: TerminalExit;
};

export type NewSessionMeta = {
  taskRunId?: string;
  disableBuiltInTools?: boolean;
  systemPrompt?: unknown;
  sessionId?: string;
  permissionMode?: string;
  persistence?: { taskId?: string; runId?: string; logUrl?: string };
  claudeCode?: {
    options?: Options;
  };
};
