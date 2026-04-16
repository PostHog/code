import type {
  Workspace,
  WorkspaceMode,
} from "@main/services/workspace/schemas";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

function useWorkspacesQuery() {
  const trpcReact = useTRPC();
  return useQuery(
    trpcReact.workspace.getAll.queryOptions(undefined, {
      staleTime: 1000 * 60,
    }),
  );
}

function useInvalidateWorkspaceCaches() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    async (mainRepoPath?: string) => {
      const tasks: Promise<void>[] = [
        queryClient.invalidateQueries(trpcReact.workspace.getAll.pathFilter()),
      ];
      if (mainRepoPath) {
        tasks.push(
          queryClient.invalidateQueries(
            trpcReact.workspace.listGitWorktrees.queryFilter({ mainRepoPath }),
          ),
        );
      }
      await Promise.all(tasks);
    },
    [queryClient, trpcReact],
  );
}

/**
 * Returns all workspaces grouped by task ID.
 * Each task may have multiple workspaces (one per repo in multi-repo setups).
 */
export function useAllWorkspaces(): {
  data: Record<string, Workspace[]> | undefined;
  isFetched: boolean;
} {
  const query = useWorkspacesQuery();
  return { data: query.data, isFetched: query.isFetched };
}

/**
 * Returns the first workspace per task for backward-compatible consumers
 * that expect a single workspace per task.
 */
export function useWorkspaces(): {
  data: Record<string, Workspace> | undefined;
  isFetched: boolean;
} {
  const query = useWorkspacesQuery();
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const result: Record<string, Workspace> = {};
    for (const [taskId, workspaceArr] of Object.entries(query.data)) {
      if (workspaceArr.length > 0) {
        result[taskId] = workspaceArr[0];
      }
    }
    return result;
  }, [query.data]);
  return { data, isFetched: query.isFetched };
}

/**
 * Returns all workspaces for a specific task.
 */
export function useTaskWorkspaces(taskId: string | undefined): Workspace[] {
  const { data: allWorkspaces } = useWorkspacesQuery();
  return useMemo(
    () => allWorkspaces?.[taskId ?? ""] ?? [],
    [allWorkspaces, taskId],
  );
}

/**
 * Returns the first workspace for a task (backward compatible).
 */
export function useWorkspace(taskId: string | undefined): Workspace | null {
  const { data: allWorkspaces } = useWorkspacesQuery();
  return useMemo(() => {
    const arr = allWorkspaces?.[taskId ?? ""];
    return arr?.[0] ?? null;
  }, [allWorkspaces, taskId]);
}

export function useIsWorkspaceCloudRun(taskId: string | undefined): boolean {
  const workspace = useWorkspace(taskId);
  return workspace?.mode === "cloud";
}

export function useWorkspaceLoaded(): boolean {
  const { isFetched } = useWorkspacesQuery();
  return isFetched;
}

export function useCreateWorkspace(): { isPending: boolean } {
  const trpcReact = useTRPC();
  const invalidateCaches = useInvalidateWorkspaceCaches();

  const mutation = useMutation(
    trpcReact.workspace.create.mutationOptions({
      onSuccess: (_data, variables) => {
        void invalidateCaches(variables.mainRepoPath);
      },
    }),
  );

  return { isPending: mutation.isPending };
}

export function useDeleteWorkspace(): { isPending: boolean } {
  const trpcReact = useTRPC();
  const invalidateCaches = useInvalidateWorkspaceCaches();

  const mutation = useMutation(
    trpcReact.workspace.delete.mutationOptions({
      onSuccess: (_data, variables) => {
        void invalidateCaches(variables.mainRepoPath);
      },
    }),
  );

  return { isPending: mutation.isPending };
}

export function useEnsureWorkspace(): {
  ensureWorkspace: (
    taskId: string,
    repoPath: string,
    mode?: WorkspaceMode,
    branch?: string | null,
  ) => Promise<Workspace | null>;
  isCreating: boolean;
} {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  const invalidateCaches = useInvalidateWorkspaceCaches();

  const createMutation = useMutation(
    trpcReact.workspace.create.mutationOptions({
      onSuccess: (_data, variables) => {
        void invalidateCaches(variables.mainRepoPath);
      },
    }),
  );

  const ensureWorkspace = useCallback(
    async (
      taskId: string,
      repoPath: string,
      mode: WorkspaceMode = "worktree",
      branch?: string | null,
    ): Promise<Workspace | null> => {
      const existing = queryClient.getQueryData(
        trpcReact.workspace.getAll.queryKey(),
      )?.[taskId];
      if (existing && existing.length > 0) {
        return existing[0];
      }

      const result = await createMutation.mutateAsync({
        taskId,
        mainRepoPath: repoPath,
        folderId: "",
        folderPath: repoPath,
        mode,
        branch: branch ?? undefined,
      });

      if (!result || result.length === 0) {
        throw new Error("Failed to create workspace");
      }

      await invalidateCaches(repoPath);
      const cached = queryClient.getQueryData(
        trpcReact.workspace.getAll.queryKey(),
      )?.[taskId];
      return cached?.[0] ?? null;
    },
    [createMutation, queryClient, trpcReact, invalidateCaches],
  );

  return {
    ensureWorkspace,
    isCreating: createMutation.isPending,
  };
}

export const workspaceApi = {
  async getAll(): Promise<Record<string, Workspace[]>> {
    return (await trpcClient.workspace.getAll.query()) ?? {};
  },

  /** Returns the first workspace for a task, or null. */
  async get(taskId: string): Promise<Workspace | null> {
    const workspaces = await trpcClient.workspace.getAll.query();
    const arr = workspaces?.[taskId];
    return arr?.[0] ?? null;
  },

  /** Returns all workspaces for a task. */
  async getTaskWorkspaces(taskId: string): Promise<Workspace[]> {
    const workspaces = await trpcClient.workspace.getAll.query();
    return workspaces?.[taskId] ?? [];
  },

  async create(options: {
    taskId: string;
    mainRepoPath: string;
    folderId: string;
    folderPath: string;
    mode: WorkspaceMode;
    branch?: string;
    label?: string;
  }) {
    return trpcClient.workspace.create.mutate(options);
  },

  async delete(taskId: string, mainRepoPath: string) {
    return trpcClient.workspace.delete.mutate({ taskId, mainRepoPath });
  },

  async verify(taskId: string) {
    return trpcClient.workspace.verify.query({ taskId });
  },
};
