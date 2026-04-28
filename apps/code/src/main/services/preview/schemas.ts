import { z } from "zod";

// -----------------------------------------------------------------------------
// Tool / service input schemas
// -----------------------------------------------------------------------------

export const registerPreviewInputSchema = z.object({
  taskId: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  cwd: z.string().optional(),
  healthPath: z.string().optional(),
});

export type RegisterPreviewInput = z.infer<typeof registerPreviewInputSchema>;

export const registerPreviewOutputSchema = z.object({
  url: z.string(),
});

export type RegisterPreviewOutput = z.infer<typeof registerPreviewOutputSchema>;

export const unregisterPreviewInputSchema = z.object({
  taskId: z.string().min(1),
  name: z.string().min(1).optional(),
});

export type UnregisterPreviewInput = z.infer<
  typeof unregisterPreviewInputSchema
>;

export const listPreviewsInputSchema = z.object({
  taskId: z.string().min(1),
});

export const previewStatusSchema = z.enum([
  "starting",
  "ready",
  "degraded",
  "exited",
]);

export type PreviewStatus = z.infer<typeof previewStatusSchema>;

export const previewListEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
  port: z.number().int().nonnegative(),
  status: previewStatusSchema,
});

export type PreviewListEntry = z.infer<typeof previewListEntrySchema>;

export const listPreviewsOutputSchema = z.array(previewListEntrySchema);

// -----------------------------------------------------------------------------
// Service event payload schemas
// -----------------------------------------------------------------------------

export const previewRegisteredPayloadSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  url: z.string(),
  port: z.number().int().nonnegative(),
});

export type PreviewRegisteredPayload = z.infer<
  typeof previewRegisteredPayloadSchema
>;

export const previewReadyPayloadSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  url: z.string(),
  port: z.number().int().nonnegative(),
});

export type PreviewReadyPayload = z.infer<typeof previewReadyPayloadSchema>;

export const previewExitedPayloadSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable().optional(),
});

export type PreviewExitedPayload = z.infer<typeof previewExitedPayloadSchema>;

export const previewUnregisteredPayloadSchema = z.object({
  taskId: z.string(),
  name: z.string(),
});

export type PreviewUnregisteredPayload = z.infer<
  typeof previewUnregisteredPayloadSchema
>;
