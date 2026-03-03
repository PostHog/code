import type { HookCallback, HookInput } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../../utils/logger.js";
import type { SettingsManager } from "./session/settings.js";
import type { TwigExecutionMode } from "./tools.js";

const toolUseCallbacks: {
  [toolUseId: string]: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  };
} = {};

export const registerHookCallback = (
  toolUseID: string,
  {
    onPostToolUseHook,
  }: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  },
) => {
  toolUseCallbacks[toolUseID] = {
    onPostToolUseHook,
  };
};

export type OnModeChange = (mode: TwigExecutionMode) => Promise<void>;

interface CreatePostToolUseHookParams {
  onModeChange?: OnModeChange;
}

export const createPostToolUseHook =
  ({ onModeChange }: CreatePostToolUseHookParams): HookCallback =>
  async (
    input: HookInput,
    toolUseID: string | undefined,
  ): Promise<{ continue: boolean }> => {
    if (input.hook_event_name === "PostToolUse") {
      const toolName = input.tool_name;

      if (onModeChange && toolName === "EnterPlanMode") {
        await onModeChange("plan");
      }

      if (toolUseID) {
        const onPostToolUseHook =
          toolUseCallbacks[toolUseID]?.onPostToolUseHook;
        if (onPostToolUseHook) {
          await onPostToolUseHook(
            toolUseID,
            input.tool_input,
            input.tool_response,
          );
          delete toolUseCallbacks[toolUseID];
        }
      }
    }
    return { continue: true };
  };

export const createPreToolUseHook =
  (settingsManager: SettingsManager, logger: Logger): HookCallback =>
  async (input: HookInput, _toolUseID: string | undefined) => {
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input;
    const permissionCheck = settingsManager.checkPermission(
      toolName,
      toolInput,
    );

    if (permissionCheck.decision !== "ask") {
      logger.info(
        `[PreToolUseHook] Tool: ${toolName}, Decision: ${permissionCheck.decision}, Rule: ${permissionCheck.rule}`,
      );
    }

    switch (permissionCheck.decision) {
      case "allow":
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse" as const,
            permissionDecision: "allow" as const,
            permissionDecisionReason: `Allowed by settings rule: ${permissionCheck.rule}`,
          },
        };
      case "deny":
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse" as const,
            permissionDecision: "deny" as const,
            permissionDecisionReason: `Denied by settings rule: ${permissionCheck.rule}`,
          },
        };
      default:
        return { continue: true };
    }
  };
