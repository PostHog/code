import type { RegisteredFolder } from "@main/services/folders/schemas";
import { useFocusStore } from "@renderer/stores/focusStore";
import { trpc, trpcClient, useTRPC } from "@renderer/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { queryClient } from "@utils/queryClient";
import { useCallback, useEffect, useMemo, useRef } from "react";

const log = logger.scope("folders");

export function useFolders() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  const hasInitialized = useRef(false);

  const { data: folders = [], isLoading } = useQuery(
    trpcReact.folders.getFolders.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );

  const existingFolders = useMemo(
    () => folders.filter((f) => f.exists !== false),
    [folders],
  );

  useEffect(() => {
    if (hasInitialized.current || isLoading || folders.length === 0) return;
    hasInitialized.current = true;

    const deletedFolders = folders.filter((f) => f.exists === false);
    if (deletedFolders.length > 0) {
      Promise.all(
        deletedFolders.map((folder) =>
          trpcClient.folders.removeFolder
            .mutate({ folderId: folder.id })
            .catch((err) =>
              log.error(`Failed to remove deleted folder ${folder.path}:`, err),
            ),
        ),
      ).then(() => {
        void queryClient.invalidateQueries(
          trpcReact.folders.getFolders.pathFilter(),
        );
      });
    }

    for (const folder of existingFolders) {
      useFocusStore
        .getState()
        .restore(folder.path)
        .catch((error) => {
          log.error(`Failed to restore focus state for ${folder.path}:`, error);
        });

      trpcClient.folders.cleanupOrphanedWorktrees
        .mutate({ mainRepoPath: folder.path })
        .catch((error) => {
          log.error(
            `Failed to cleanup orphaned worktrees for ${folder.path}:`,
            error,
          );
        });
    }
  }, [folders, existingFolders, isLoading, queryClient, trpcReact]);

  const addFolderMutation = useMutation(
    trpcReact.folders.addFolder.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpcReact.folders.getFolders.pathFilter(),
        );
      },
    }),
  );

  const removeFolderMutation = useMutation(
    trpcReact.folders.removeFolder.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpcReact.folders.getFolders.pathFilter(),
        );
      },
    }),
  );

  const updateAccessedMutation = useMutation(
    trpcReact.folders.updateFolderAccessed.mutationOptions(),
  );

  const addFolder = useCallback(
    async (folderPath: string) => {
      return addFolderMutation.mutateAsync({ folderPath });
    },
    [addFolderMutation],
  );

  const removeFolder = useCallback(
    async (folderId: string) => {
      return removeFolderMutation.mutateAsync({ folderId });
    },
    [removeFolderMutation],
  );

  const updateLastAccessed = useCallback(
    (folderId: string) => {
      updateAccessedMutation.mutate({ folderId });
    },
    [updateAccessedMutation],
  );

  const getFolderByPath = useCallback(
    (path: string) => existingFolders.find((f) => f.path === path),
    [existingFolders],
  );

  const getRecentFolders = useCallback(
    (limit = 5) =>
      [...existingFolders]
        .sort(
          (a, b) =>
            new Date(b.lastAccessed).getTime() -
            new Date(a.lastAccessed).getTime(),
        )
        .slice(0, limit),
    [existingFolders],
  );

  const getFolderDisplayName = useCallback(
    (path: string) => {
      if (!path) return null;
      const folder = existingFolders.find((f) => f.path === path);
      return folder?.name ?? path.split("/").pop() ?? null;
    },
    [existingFolders],
  );

  const loadFolders = useCallback(() => {
    void queryClient.invalidateQueries(
      trpcReact.folders.getFolders.pathFilter(),
    );
  }, [queryClient, trpcReact]);

  return {
    folders: existingFolders,
    isLoaded: !isLoading,
    addFolder,
    removeFolder,
    updateLastAccessed,
    getFolderByPath,
    getRecentFolders,
    getFolderDisplayName,
    loadFolders,
  };
}

const invalidateFolders = () => {
  void queryClient.invalidateQueries(trpc.folders.getFolders.pathFilter());
};

export const foldersApi = {
  async getFolders() {
    return trpcClient.folders.getFolders.query();
  },
  async addFolder(folderPath: string) {
    const newFolder = await trpcClient.folders.addFolder.mutate({
      folderPath,
    });
    invalidateFolders();
    return newFolder;
  },
  async removeFolder(folderId: string) {
    const result = await trpcClient.folders.removeFolder.mutate({ folderId });
    invalidateFolders();
    return result;
  },
  async updateFolderAccessed(folderId: string) {
    return trpcClient.folders.updateFolderAccessed.mutate({ folderId });
  },
  async cleanupOrphanedWorktrees(mainRepoPath: string) {
    return trpcClient.folders.cleanupOrphanedWorktrees.mutate({
      mainRepoPath,
    });
  },
  getFolderByPath(folders: RegisteredFolder[], path: string) {
    return folders.find((f) => f.path === path);
  },
  getFolderDisplayName(folders: RegisteredFolder[], path: string) {
    if (!path) return null;
    const folder = folders.find((f) => f.path === path);
    return folder?.name ?? path.split("/").pop() ?? null;
  },
};
