import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { logger } from "@utils/logger";
import { useEffect } from "react";

const log = logger.scope("file-watcher");

export function useFileWatcher(repoPath: string | null, taskId?: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const closeTabsForFile = usePanelLayoutStore((s) => s.closeTabsForFile);

  useEffect(() => {
    if (!repoPath) return;

    trpcClient.fileWatcher.start.mutate({ repoPath }).catch((error) => {
      log.error("Failed to start file watcher:", error);
    });

    return () => {
      trpcClient.fileWatcher.stop.mutate({ repoPath });
    };
  }, [repoPath]);

  useSubscription(
    trpc.fileWatcher.onFileChanged.subscriptionOptions(undefined, {
      enabled: !!repoPath,
      onData: ({ repoPath: rp, filePath }) => {
        if (rp !== repoPath) return;
        const relativePath = filePath.replace(`${repoPath}/`, "");
        queryClient.invalidateQueries(
          trpc.fs.readRepoFile.queryFilter({
            repoPath,
            filePath: relativePath,
          }),
        );
        queryClient.invalidateQueries(
          trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getDiffStats.queryFilter({ directoryPath: repoPath }),
        );
      },
    }),
  );

  useSubscription(
    trpc.fileWatcher.onFileDeleted.subscriptionOptions(undefined, {
      enabled: !!repoPath,
      onData: ({ repoPath: rp, filePath }) => {
        if (rp !== repoPath) return;
        queryClient.invalidateQueries(
          trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getDiffStats.queryFilter({ directoryPath: repoPath }),
        );
        if (!taskId) return;
        const relativePath = filePath.replace(`${repoPath}/`, "");
        closeTabsForFile(taskId, relativePath);
      },
    }),
  );

  useSubscription(
    trpc.fileWatcher.onGitStateChanged.subscriptionOptions(undefined, {
      enabled: !!repoPath,
      onData: ({ repoPath: rp }) => {
        if (rp !== repoPath) return;
        queryClient.invalidateQueries(trpc.git.getFileAtHead.pathFilter());
        queryClient.invalidateQueries(
          trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getDiffStats.queryFilter({ directoryPath: repoPath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getGitSyncStatus.queryFilter({ directoryPath: repoPath }),
        );
      },
    }),
  );
}
