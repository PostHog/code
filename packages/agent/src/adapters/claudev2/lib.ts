// Export the main agent class and utilities for library usage
export {
  ClaudeAcpAgent,
  type NewSessionMeta,
  streamEventToAcpNotifications,
  type ToolUpdateMeta,
  toAcpNotifications,
} from "./acp-agent.js";
export {
  type ClaudeCodeSettings,
  SettingsManager,
  type SettingsManagerOptions,
} from "./settings.js";
// Export types
export type { ClaudePlanEntry } from "./tools.js";
export {
  planEntries,
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
} from "./tools.js";
export {
  applyEnvironmentSettings,
  loadManagedSettings,
  nodeToWebReadable,
  nodeToWebWritable,
  Pushable,
  unreachable,
} from "./utils.js";
