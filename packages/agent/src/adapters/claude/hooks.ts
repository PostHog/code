import type {
  HookCallback,
  HookInput,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../../utils/logger.js";
import { ensureMcpServersConnected } from "./mcp/reconnect.js";
import type { TwigExecutionMode } from "./tools.js";

/**
 * Mutable ref so the PostToolUseFailure hook (registered before the Query
 * exists) can access it once it's created. Same idea as React's useRef.
 */
export type QueryRef = { current: Query | null };

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

interface CreatePostToolUseFailureHookParams {
  queryRef: QueryRef;
  logger: Logger;
}

export const createPostToolUseFailureHook =
  ({ queryRef, logger }: CreatePostToolUseFailureHookParams): HookCallback =>
  async (input: HookInput): Promise<{ continue: boolean }> => {
    if (
      input.hook_event_name !== "PostToolUseFailure" ||
      !input.tool_name.startsWith("mcp__")
    ) {
      return { continue: true };
    }

    if (!queryRef.current) {
      logger.warn(
        "PostToolUseFailure: queryRef not yet initialized, skipping MCP reconnect",
      );
      return { continue: true };
    }

    try {
      await ensureMcpServersConnected(queryRef.current, logger);
    } catch (err) {
      logger.warn("PostToolUseFailure: MCP reconnect failed", { error: err });
    }

    return { continue: true };
  };
