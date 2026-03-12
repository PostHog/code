import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  CanUseTool,
  McpServerConfig,
  Options,
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { IS_ROOT } from "../../../utils/common";
import type { Logger } from "../../../utils/logger";
import {
  createPostToolUseHook,
  createPreToolUseHook,
  type OnModeChange,
} from "../hooks";
import type { CodeExecutionMode } from "../tools";
import type { EffortLevel } from "../types";
import { APPENDED_INSTRUCTIONS } from "./instructions";
import { DEFAULT_MODEL } from "./models";
import type { SettingsManager } from "./settings";

export interface ProcessSpawnedInfo {
  pid: number;
  command: string;
  sessionId: string;
}

export interface BuildOptionsParams {
  cwd: string;
  mcpServers: Record<string, McpServerConfig>;
  permissionMode: CodeExecutionMode;
  canUseTool: CanUseTool;
  logger: Logger;
  systemPrompt?: Options["systemPrompt"];
  userProvidedOptions?: Options;
  sessionId: string;
  isResume: boolean;
  forkSession?: boolean;
  additionalDirectories?: string[];
  disableBuiltInTools?: boolean;
  settingsManager: SettingsManager;
  onModeChange?: OnModeChange;
  onProcessSpawned?: (info: ProcessSpawnedInfo) => void;
  onProcessExited?: (pid: number) => void;
  effort?: EffortLevel;
}

export function buildSystemPrompt(
  customPrompt?: unknown,
): Options["systemPrompt"] {
  const defaultPrompt: Options["systemPrompt"] = {
    type: "preset",
    preset: "claude_code",
    append: APPENDED_INSTRUCTIONS,
  };

  if (!customPrompt) {
    return defaultPrompt;
  }

  if (typeof customPrompt === "string") {
    return customPrompt + APPENDED_INSTRUCTIONS;
  }

  if (
    typeof customPrompt === "object" &&
    customPrompt !== null &&
    "append" in customPrompt &&
    typeof customPrompt.append === "string"
  ) {
    return {
      ...defaultPrompt,
      append: customPrompt.append + APPENDED_INSTRUCTIONS,
    };
  }

  return defaultPrompt;
}

function buildMcpServers(
  userServers: Record<string, McpServerConfig> | undefined,
  acpServers: Record<string, McpServerConfig>,
): Record<string, McpServerConfig> {
  return {
    ...(userServers || {}),
    ...acpServers,
  };
}

function buildEnvironment(): Record<string, string> {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: "true",
    // Offload all MCP tools by default
    ENABLE_TOOL_SEARCH: "auto:0",
  };
}

function buildHooks(
  userHooks: Options["hooks"],
  onModeChange: OnModeChange | undefined,
  settingsManager: SettingsManager,
  logger: Logger,
): Options["hooks"] {
  return {
    ...userHooks,
    PostToolUse: [
      ...(userHooks?.PostToolUse || []),
      {
        hooks: [createPostToolUseHook({ onModeChange, logger })],
      },
    ],
    PreToolUse: [
      ...(userHooks?.PreToolUse || []),
      {
        hooks: [createPreToolUseHook(settingsManager, logger)],
      },
    ],
  };
}

function getAbortController(
  userProvidedController: AbortController | undefined,
): AbortController {
  const controller = userProvidedController ?? new AbortController();
  if (controller.signal.aborted) {
    throw new Error("Cancelled");
  }
  return controller;
}

function buildSpawnWrapper(
  sessionId: string,
  onProcessSpawned: (info: ProcessSpawnedInfo) => void,
  onProcessExited?: (pid: number) => void,
  logger?: Logger,
): (options: SpawnOptions) => SpawnedProcess {
  return (spawnOpts: SpawnOptions): SpawnedProcess => {
    const child = spawn(spawnOpts.command, spawnOpts.args, {
      cwd: spawnOpts.cwd,
      env: spawnOpts.env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (child.pid) {
      onProcessSpawned({
        pid: child.pid,
        command: `${spawnOpts.command} ${spawnOpts.args.join(" ")}`,
        sessionId,
      });
    }

    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && logger) {
        logger.debug(`[claude-code:${child.pid}] stderr: ${msg}`);
      }
    });

    if (onProcessExited) {
      child.on("exit", () => {
        if (child.pid) {
          onProcessExited(child.pid);
        }
      });
    }

    // Listen for abort signal
    if (spawnOpts.signal) {
      spawnOpts.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }

    if (!child.stdin || !child.stdout) {
      throw new Error(
        `Failed to get stdio streams for spawned process (pid=${child.pid})`,
      );
    }

    return {
      stdin: child.stdin,
      stdout: child.stdout,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill(signal: NodeJS.Signals) {
        return child.kill(signal);
      },
      // biome-ignore lint/suspicious/noExplicitAny: ChildProcess event listener types require any[]
      on(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.on(event, listener);
      },
      // biome-ignore lint/suspicious/noExplicitAny: ChildProcess event listener types require any[]
      once(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.once(event, listener);
      },
      // biome-ignore lint/suspicious/noExplicitAny: ChildProcess event listener types require any[]
      off(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.off(event, listener);
      },
    };
  };
}

function ensureLocalSettings(cwd: string): void {
  const claudeDir = path.join(cwd, ".claude");
  const localSettingsPath = path.join(claudeDir, "settings.local.json");
  try {
    if (!fs.existsSync(localSettingsPath)) {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(localSettingsPath, "{}\n", { flag: "wx" });
    }
  } catch {
    // Best-effort — don't fail session creation if we can't write
  }
}

export function buildSessionOptions(params: BuildOptionsParams): Options {
  ensureLocalSettings(params.cwd);

  // Resolve which built-in tools to expose.
  // Explicit tools array from userProvidedOptions takes precedence.
  // disableBuiltInTools is a legacy shorthand for tools: [] — kept for
  // backward compatibility but callers should prefer the tools array.
  const tools: Options["tools"] =
    params.userProvidedOptions?.tools ??
    (params.disableBuiltInTools
      ? []
      : { type: "preset", preset: "claude_code" });

  const options: Options = {
    ...params.userProvidedOptions,
    systemPrompt: params.systemPrompt ?? buildSystemPrompt(),
    settingSources: ["user", "project", "local"],
    stderr: (err) => params.logger.error(err),
    cwd: params.cwd,
    includePartialMessages: true,
    allowDangerouslySkipPermissions: !IS_ROOT,
    permissionMode: params.permissionMode,
    canUseTool: params.canUseTool,
    executable: "node",
    tools,
    extraArgs: {
      ...params.userProvidedOptions?.extraArgs,
      "replay-user-messages": "",
    },
    mcpServers: buildMcpServers(
      params.userProvidedOptions?.mcpServers,
      params.mcpServers,
    ),
    env: buildEnvironment(),
    hooks: buildHooks(
      params.userProvidedOptions?.hooks,
      params.onModeChange,
      params.settingsManager,
      params.logger,
    ),
    abortController: getAbortController(
      params.userProvidedOptions?.abortController,
    ),
    ...(params.onProcessSpawned && {
      spawnClaudeCodeProcess: buildSpawnWrapper(
        params.sessionId,
        params.onProcessSpawned,
        params.onProcessExited,
        params.logger,
      ),
    }),
  };

  if (process.env.CLAUDE_CODE_EXECUTABLE) {
    options.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_EXECUTABLE;
  }

  if (params.isResume) {
    options.resume = params.sessionId;
    options.forkSession = params.forkSession ?? false;
  } else {
    options.sessionId = params.sessionId;
    options.model = DEFAULT_MODEL;
  }

  if (params.additionalDirectories) {
    options.additionalDirectories = params.additionalDirectories;
  }

  if (params.effort) {
    options.effort = params.effort;
  }

  clearStatsigCache();
  return options;
}

function clearStatsigCache(): void {
  const statsigPath = path.join(
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
    "statsig",
  );
  fs.rm(statsigPath, { recursive: true, force: true }, () => {
    // Best-effort, ignore errors
  });
}
