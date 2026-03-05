import { workspaceApi } from "@renderer/features/workspace/hooks/useWorkspace";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { expandTildePath } from "@utils/path";

export function getTaskDirectorySync(
  _taskId: string,
  repoKey?: string,
): string | null {
  if (repoKey) {
    const foldersStore = useRegisteredFoldersStore.getState();
    const folder = foldersStore.folders.find((f) => f.remoteUrl === repoKey);
    if (folder) {
      return expandTildePath(folder.path);
    }
  }

  return null;
}

export async function getTaskDirectoryAsync(
  taskId: string,
  repoKey?: string,
): Promise<string | null> {
  const workspace = await workspaceApi.get(taskId);
  if (workspace?.folderPath) {
    return expandTildePath(workspace.folderPath);
  }

  if (repoKey) {
    const repo = await trpcVanilla.folders.getRepositoryByRemoteUrl.query({
      remoteUrl: repoKey,
    });
    if (repo) {
      return expandTildePath(repo.path);
    }
  }

  return null;
}

export async function getLastUsedDirectoryAsync(): Promise<string | null> {
  const repo =
    await trpcVanilla.folders.getMostRecentlyAccessedRepository.query();
  return repo?.path ?? null;
}

export function getDirectoryForRepoKey(repoKey: string): string | null {
  const foldersStore = useRegisteredFoldersStore.getState();
  const folder = foldersStore.folders.find((f) => f.remoteUrl === repoKey);
  return folder?.path ?? null;
}

export function hasDirectoryForRepoKey(repoKey: string): boolean {
  const foldersStore = useRegisteredFoldersStore.getState();
  return foldersStore.folders.some((f) => f.remoteUrl === repoKey);
}
