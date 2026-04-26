import { z } from "zod";

// -----------------------------------------------------------------------------
// Manifest schema (`.posthog.json` at the scratchpad root)
// -----------------------------------------------------------------------------

export const previewEntrySchema = z.object({
  name: z.string(),
  command: z.string(),
  port: z.number().int().nonnegative(),
  cwd: z.string().optional(),
});

export type PreviewEntry = z.infer<typeof previewEntrySchema>;

export const manifestSchema = z.object({
  /**
   * Linked PostHog project. `null` when the user picked "Skip for now" at
   * scratchpad creation time — instrumentation skills and Publish will
   * prompt them to link a project later.
   */
  projectId: z.number().int().nullable(),
  /** AUTHORITATIVE for draft state. */
  published: z.boolean(),
  preview: z.array(previewEntrySchema).optional(),
  /** ISO8601, set on Publish. */
  publishedAt: z.string().optional(),
  /** Set on Publish. */
  githubRemote: z.string().optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;

export const manifestPatchSchema = manifestSchema.partial();

export type ManifestPatch = z.infer<typeof manifestPatchSchema>;

// -----------------------------------------------------------------------------
// Event payload schemas
// -----------------------------------------------------------------------------

export const createdEventSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  scratchpadPath: z.string(),
  manifest: manifestSchema,
});

export type CreatedEventPayload = z.infer<typeof createdEventSchema>;

export const manifestUpdatedEventSchema = z.object({
  taskId: z.string(),
  manifest: manifestSchema,
});

export type ManifestUpdatedEventPayload = z.infer<
  typeof manifestUpdatedEventSchema
>;

export const previewRegisteredEventSchema = z.object({
  taskId: z.string(),
  preview: previewEntrySchema,
});

export type PreviewRegisteredEventPayload = z.infer<
  typeof previewRegisteredEventSchema
>;

export const previewReadyEventSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  port: z.number().int().nonnegative(),
  url: z.string(),
});

export type PreviewReadyEventPayload = z.infer<typeof previewReadyEventSchema>;

export const previewExitedEventSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  exitCode: z.number().nullable(),
});

export type PreviewExitedEventPayload = z.infer<
  typeof previewExitedEventSchema
>;

export const publishedEventSchema = z.object({
  taskId: z.string(),
  manifest: manifestSchema,
  repoFullName: z.string(),
  githubRemote: z.string(),
});

export type PublishedEventPayload = z.infer<typeof publishedEventSchema>;

export const deletedEventSchema = z.object({
  taskId: z.string(),
});

export type DeletedEventPayload = z.infer<typeof deletedEventSchema>;

// -----------------------------------------------------------------------------
// tRPC input/output schemas
// -----------------------------------------------------------------------------

export const taskIdInput = z.object({
  taskId: z.string().min(1),
});

export const createScratchpadInput = z.object({
  taskId: z.string().min(1),
  name: z.string().min(1),
  projectId: z.number().int().nullish(),
});

export const createScratchpadOutput = z.object({
  scratchpadPath: z.string(),
});

export type CreateScratchpadOutput = z.infer<typeof createScratchpadOutput>;

export const writeManifestInput = z.object({
  taskId: z.string().min(1),
  patch: manifestPatchSchema,
});

export const scratchpadListEntrySchema = z.object({
  taskId: z.string(),
  name: z.string(),
  manifest: manifestSchema,
});

export type ScratchpadListEntry = z.infer<typeof scratchpadListEntrySchema>;

export const scratchpadListOutput = z.array(scratchpadListEntrySchema);

// -----------------------------------------------------------------------------
// Publish I/O
// -----------------------------------------------------------------------------

export const publishVisibilitySchema = z.enum(["public", "private"]);

export type PublishVisibility = z.infer<typeof publishVisibilitySchema>;

export const publishInputSchema = z.object({
  taskId: z.string().min(1),
  repoName: z.string().min(1).max(100),
  visibility: publishVisibilitySchema.default("private"),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Successful publish: the GitHub repo was created and the local manifest is
 * patched with `published: true`.
 *
 * Failure cases use `success: false` with a structured `code` so the renderer
 * can present the right recovery UI:
 *
 * - `already_published`: manifest already had `published: true`; no side effects.
 * - `secret_leakage`: gitignore-filtered file walk found env files / large blobs.
 *   `paths` lists offending files.
 * - `repo_name_conflict`: GitHub returned 422 (name already taken).
 * - `push_failed`: repo was created on GitHub but the push failed; manual
 *   intervention required.
 * - `github_error`: any other non-2xx from `POST /user/repos`.
 * - `no_gh_token`: `gh auth token` returned no token.
 * - `git_error`: `git init` / `git add` / `git commit` failed.
 */
export const publishOutputSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    manifest: manifestSchema,
    repoFullName: z.string(),
    githubRemote: z.string(),
  }),
  z.object({
    success: z.literal(false),
    code: z.enum([
      "already_published",
      "secret_leakage",
      "repo_name_conflict",
      "push_failed",
      "github_error",
      "no_gh_token",
      "git_error",
    ]),
    message: z.string(),
    paths: z.array(z.string()).optional(),
  }),
]);

export type PublishResult = z.infer<typeof publishOutputSchema>;
