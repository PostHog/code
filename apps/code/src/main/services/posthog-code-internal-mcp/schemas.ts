import { z } from "zod";

export const customInstructionsChanged = z.object({
  customInstructions: z.string(),
});

export type CustomInstructionsChanged = z.infer<
  typeof customInstructionsChanged
>;

export const PostHogCodeInternalMcpEvent = {
  CustomInstructionsChanged: "custom-instructions-changed",
  McpServerInstalled: "mcp-server-installed",
} as const;

export interface PostHogCodeInternalMcpEvents {
  [PostHogCodeInternalMcpEvent.CustomInstructionsChanged]: CustomInstructionsChanged;
  [PostHogCodeInternalMcpEvent.McpServerInstalled]: Record<never, never>;
}
