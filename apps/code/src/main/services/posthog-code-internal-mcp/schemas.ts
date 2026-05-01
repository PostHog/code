import { z } from "zod";

export const customInstructionsChanged = z.object({
  customInstructions: z.string(),
});

export type CustomInstructionsChanged = z.infer<
  typeof customInstructionsChanged
>;

export const PostHogCodeInternalMcpEvent = {
  CustomInstructionsChanged: "custom-instructions-changed",
} as const;

export interface PostHogCodeInternalMcpEvents {
  [PostHogCodeInternalMcpEvent.CustomInstructionsChanged]: CustomInstructionsChanged;
}
