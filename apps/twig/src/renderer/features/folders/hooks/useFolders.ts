import type { RegisteredFolder } from "@main/services/folders/schemas";
import { useFocusStore } from "@renderer/stores/focusStore";
import { trpcReact, trpcVanilla } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { useCallback, useEffect, useMemo, useRef } from "react";

const log = logger.scope("folders");

const folderKeys = {
  all: ["folders"] as const,
  list: () => [...folderKeys.all, "list"] as const,
};

export function useFolders() {
  const queryClient = useQueryClient();
  const hasInitialized = useRef(false);

  const { data: folders = [], isLoading } =
    trpcReact.folders.getFolders.useQuery(undefined, {
      staleTime: 30_000,
    });

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
          trpcVanilla.folders.removeFolder
            .mutate({ folderId: folder.id })
            .catch((err) =>
              log.error(`Failed to remove deleted folder ${folder.path}:`, err),
            ),
        ),
      ).then(() => {
        queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      });
    }

    for (const folder of existingFolders) {
      useFocusStore
        .getState()
        .restore(folder.path)
        .catch((error) => {
          log.error(`Failed to restore focus state for ${folder.path}:`, error);
        });

      trpcVanilla.folders.cleanupOrphanedWorktrees
        .mutate({ mainRepoPath: folder.path })
        .catch((error) => {
          log.error(
            `Failed to cleanup orphaned worktrees for ${folder.path}:`,
            error,
          );
        });
    }
  }, [folders, existingFolders, isLoading, queryClient]);

  const addFolderMutation = trpcReact.folders.addFolder.useMutation({
    onSuccess: (newFolder) => {
      queryClient.setQueryData<RegisteredFolder[]>(folderKeys.list(), (old) =>
        old ? [...old, newFolder] : [newFolder],
      );
    },
  });

  const removeFolderMutation = trpcReact.folders.removeFolder.useMutation({
    onSuccess: (_, { folderId }) => {
      queryClient.setQueryData<RegisteredFolder[]>(folderKeys.list(), (old) =>
        old?.filter((f) => f.id !== folderId),
      );
    },
  });

  const updateAccessedMutation =
    trpcReact.folders.updateFolderAccessed.useMutation();

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
    queryClient.invalidateQueries({ queryKey: folderKeys.list() });
  }, [queryClient]);

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

export const foldersApi = {
  async getFolders() {
    return trpcVanilla.folders.getFolders.query();
  },
  async addFolder(folderPath: string) {
    return trpcVanilla.folders.addFolder.mutate({ folderPath });
  },
  async removeFolder(folderId: string) {
    return trpcVanilla.folders.removeFolder.mutate({ folderId });
  },
  async updateFolderAccessed(folderId: string) {
    return trpcVanilla.folders.updateFolderAccessed.mutate({ folderId });
  },
  async cleanupOrphanedWorktrees(mainRepoPath: string) {
    return trpcVanilla.folders.cleanupOrphanedWorktrees.mutate({
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
