export {
  CODE_EXECUTION_MODES,
  type CodeExecutionMode,
  getAvailableModes,
  type ModeInfo,
} from "../../execution-mode.js";

import type { CodeExecutionMode } from "../../execution-mode.js";
import { isMcpToolReadOnly } from "./mcp/tool-metadata.js";

const SHELL_OPERATORS = ["&&", "||", ";", "|", "$(", "`", "\n", ">>", ">", "<"];

function containsShellOperator(command: string): boolean {
  return SHELL_OPERATORS.some((op) => command.includes(op));
}

const READ_ONLY_PROGRAMS: Set<string> = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "wc",
  "file",
  "which",
  "type",
  "whereis",
  "pwd",
  "echo",
  "printf",
  "date",
  "env",
  "printenv",
  "uname",
  "hostname",
  "tree",
  "bat",
  "rg",
  "grep",
  "egrep",
  "fgrep",
  "fd",
  "find",
  "stat",
  "du",
  "df",
  "lsof",
  "ps",
  "sort",
  "uniq",
  "jq",
  "yq",
]);

const READ_ONLY_GIT_SUBCOMMANDS: Set<string> = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "remote",
  "tag",
  "describe",
  "rev-parse",
  "rev-list",
  "shortlog",
]);

export function isBashCommandReadOnly(
  toolName: string,
  toolInput: Record<string, unknown>,
): boolean {
  if (toolName !== "Bash") {
    return false;
  }
  const command = toolInput?.command;
  if (typeof command !== "string" || command.trim() === "") {
    return false;
  }
  if (containsShellOperator(command)) {
    return false;
  }
  const tokens = command.trim().split(/\s+/);
  const program = tokens[0];
  if (!program) {
    return false;
  }
  if (READ_ONLY_PROGRAMS.has(program)) {
    return true;
  }
  if (program === "git") {
    const subcommand = tokens[1];
    return (
      subcommand !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)
    );
  }
  return false;
}

export const READ_TOOLS: Set<string> = new Set(["Read", "NotebookRead"]);

export const WRITE_TOOLS: Set<string> = new Set([
  "Edit",
  "Write",
  "NotebookEdit",
]);

export const BASH_TOOLS: Set<string> = new Set([
  "Bash",
  "BashOutput",
  "KillShell",
]);

export const SEARCH_TOOLS: Set<string> = new Set(["Glob", "Grep", "LS"]);

export const WEB_TOOLS: Set<string> = new Set(["WebSearch", "WebFetch"]);

export const AGENT_TOOLS: Set<string> = new Set(["Task", "TodoWrite", "Skill"]);

const BASE_ALLOWED_TOOLS = [
  ...READ_TOOLS,
  ...SEARCH_TOOLS,
  ...WEB_TOOLS,
  ...AGENT_TOOLS,
];

const AUTO_ALLOWED_TOOLS: Record<string, Set<string>> = {
  default: new Set(BASE_ALLOWED_TOOLS),
  acceptEdits: new Set([...BASE_ALLOWED_TOOLS, ...WRITE_TOOLS]),
  plan: new Set(BASE_ALLOWED_TOOLS),
  // dontAsk: new Set(BASE_ALLOWED_TOOLS),
};

export function isToolAllowedForMode(
  toolName: string,
  mode: CodeExecutionMode,
  toolInput?: Record<string, unknown>,
): boolean {
  if (mode === "bypassPermissions") {
    return true;
  }
  if (AUTO_ALLOWED_TOOLS[mode]?.has(toolName) === true) {
    return true;
  }
  if (isMcpToolReadOnly(toolName)) {
    return true;
  }
  if (toolInput && isBashCommandReadOnly(toolName, toolInput)) {
    return true;
  }
  return false;
}
