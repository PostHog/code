import { workspaceApi } from "@renderer/features/workspace/hooks/useWorkspace";
import { trpcVanilla } from "@renderer/trpc/client";
import { expandTildePath } from "@utils/path";

export async function getTaskDirectory(
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

export async function getLastUsedDirectory(): Promise<string | null> {
  const repo =
    await trpcVanilla.folders.getMostRecentlyAccessedRepository.query();
  return repo?.path ?? null;
}
