import { z } from "zod";

export const cloudRegion = z.enum(["us", "eu", "dev"]);
export type CloudRegion = z.infer<typeof cloudRegion>;

export const startGitHubFlowInput = z.object({
  region: cloudRegion,
  projectId: z.number(),
});
export type StartGitHubFlowInput = z.infer<typeof startGitHubFlowInput>;

export const startGitHubFlowOutput = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type StartGitHubFlowOutput = z.infer<typeof startGitHubFlowOutput>;

export const cancelGitHubFlowOutput = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type CancelGitHubFlowOutput = z.infer<typeof cancelGitHubFlowOutput>;
