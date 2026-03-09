import { z } from "zod";

export const registeredFolderSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  remoteUrl: z.string().nullable(),
  lastAccessed: z.string(),
  createdAt: z.string(),
});

export const registeredFolderWithExistsSchema = registeredFolderSchema.extend({
  exists: z.boolean().optional(),
});

export const getFoldersOutput = z.array(registeredFolderWithExistsSchema);

export const addFolderInput = z.object({
  folderPath: z.string().min(2, "Folder path must be a valid directory path"),
});

export const addFolderOutput = registeredFolderWithExistsSchema;

export const removeFolderInput = z.object({
  folderId: z.string(),
});

export const updateFolderAccessedInput = z.object({
  folderId: z.string(),
});

export const cleanupOrphanedWorktreesInput = z.object({
  mainRepoPath: z.string(),
});

export const cleanupOrphanedWorktreesOutput = z.object({
  deleted: z.array(z.string()),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});

export type RegisteredFolder = z.infer<typeof registeredFolderWithExistsSchema>;
export type GetFoldersOutput = z.infer<typeof getFoldersOutput>;
export type AddFolderInput = z.infer<typeof addFolderInput>;
export type AddFolderOutput = z.infer<typeof addFolderOutput>;
export type RemoveFolderInput = z.infer<typeof removeFolderInput>;
export type UpdateFolderAccessedInput = z.infer<
  typeof updateFolderAccessedInput
>;
export type CleanupOrphanedWorktreesInput = z.infer<
  typeof cleanupOrphanedWorktreesInput
>;
export type CleanupOrphanedWorktreesOutput = z.infer<
  typeof cleanupOrphanedWorktreesOutput
>;

export const repositoryLookupResult = z
  .object({
    id: z.string(),
    path: z.string(),
  })
  .nullable();

export const getRepositoryByRemoteUrlInput = z.object({
  remoteUrl: z.string(),
});

export type RepositoryLookupResult = z.infer<typeof repositoryLookupResult>;
