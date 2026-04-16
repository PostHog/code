import type { HookCallback, HookInput } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../../utils/logger";
import type { SettingsManager } from "./session/settings";
import type { CodeExecutionMode } from "./tools";

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

export type OnModeChange = (mode: CodeExecutionMode) => Promise<void>;

interface CreatePostToolUseHookParams {
  onModeChange?: OnModeChange;
  logger?: Logger;
}

export const createPostToolUseHook =
  ({ onModeChange, logger }: CreatePostToolUseHookParams): HookCallback =>
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
        } else {
          logger?.error(
            `No onPostToolUseHook found for tool use ID: ${toolUseID}`,
          );
          delete toolUseCallbacks[toolUseID];
        }
      }
    }
    return { continue: true };
  };

/**
 * Rewrites Agent tool calls targeting built-in subagent types to use our custom
 * definitions instead. This works around a Claude Agent SDK bug where
 * `options.agents` cannot override built-in agent definitions because the
 * built-ins appear first in the agents array and `Array.find()` returns the
 * first match.
 *
 * By giving our custom agent a different name (e.g. "ph-explore") and rewriting
 * the subagent_type in the tool input, we sidestep the collision entirely.
 *
 * https://github.com/anthropics/claude-agent-sdk-typescript/issues/267
 */
const SUBAGENT_REWRITES: Record<string, string> = {
  Explore: "ph-explore",
};

export const createSubagentRewriteHook =
  (logger: Logger): HookCallback =>
  async (input: HookInput, _toolUseID: string | undefined) => {
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }

    if (input.tool_name !== "Agent") {
      return { continue: true };
    }

    const toolInput = input.tool_input as Record<string, unknown> | undefined;
    const subagentType = toolInput?.subagent_type;
    if (typeof subagentType !== "string" || !SUBAGENT_REWRITES[subagentType]) {
      return { continue: true };
    }

    const target = SUBAGENT_REWRITES[subagentType];
    logger.info(
      `[SubagentRewriteHook] Rewriting subagent_type: ${subagentType} → ${target}`,
    );

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        updatedInput: {
          ...toolInput,
          subagent_type: target,
        },
      },
    };
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
