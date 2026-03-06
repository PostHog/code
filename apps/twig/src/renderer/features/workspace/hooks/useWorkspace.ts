import type {
  Workspace,
  WorkspaceMode,
} from "@main/services/workspace/schemas";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { useCallback, useMemo } from "react";

function useWorkspacesQuery() {
  return trpcReact.workspace.getAll.useQuery(undefined, {
    staleTime: 1000 * 60,
  });
}

export function useWorkspaces(): {
  data: Record<string, Workspace> | undefined;
  isFetched: boolean;
} {
  const query = useWorkspacesQuery();
  return { data: query.data, isFetched: query.isFetched };
}

export function useWorkspace(taskId: string | undefined): Workspace | null {
  const { data: workspaces } = useWorkspacesQuery();
  return useMemo(
    () => workspaces?.[taskId ?? ""] ?? null,
    [workspaces, taskId],
  );
}

export function useWorkspaceLoaded(): boolean {
  const { isFetched } = useWorkspacesQuery();
  return isFetched;
}

export function useCreateWorkspace(): { isPending: boolean } {
  const utils = trpcReact.useUtils();

  const mutation = trpcReact.workspace.create.useMutation({
    onSuccess: () => {
      void utils.workspace.getAll.invalidate();
    },
  });

  return { isPending: mutation.isPending };
}

export function useDeleteWorkspace(): { isPending: boolean } {
  const utils = trpcReact.useUtils();

  const mutation = trpcReact.workspace.delete.useMutation({
    onSuccess: () => {
      void utils.workspace.getAll.invalidate();
    },
  });

  return { isPending: mutation.isPending };
}

export function useRunStartScripts(): {
  mutateAsync: (input: {
    taskId: string;
    worktreePath: string;
    worktreeName: string;
  }) => Promise<{ success: boolean; terminalSessionIds: string[] }>;
  isPending: boolean;
} {
  const mutation = trpcReact.workspace.runStart.useMutation();
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
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
  const utils = trpcReact.useUtils();
  const createMutation = trpcReact.workspace.create.useMutation({
    onSuccess: () => {
      void utils.workspace.getAll.invalidate();
    },
  });

  const ensureWorkspace = useCallback(
    async (
      taskId: string,
      repoPath: string,
      mode: WorkspaceMode = "worktree",
      branch?: string | null,
    ): Promise<Workspace | null> => {
      const existing = utils.workspace.getAll.getData()?.[taskId];
      if (existing) {
        return existing;
      }

      const result = await createMutation.mutateAsync({
        taskId,
        mainRepoPath: repoPath,
        folderId: "",
        folderPath: repoPath,
        mode,
        branch: branch ?? undefined,
      });

      if (!result) {
        throw new Error("Failed to create workspace");
      }

      await utils.workspace.getAll.invalidate();
      return utils.workspace.getAll.getData()?.[taskId] ?? null;
    },
    [createMutation, utils],
  );

  return {
    ensureWorkspace,
    isCreating: createMutation.isPending,
  };
}

export const workspaceApi = {
  async getAll(): Promise<Record<string, Workspace>> {
    return (await trpcVanilla.workspace.getAll.query()) ?? {};
  },

  async get(taskId: string): Promise<Workspace | null> {
    const workspaces = await trpcVanilla.workspace.getAll.query();
    return workspaces?.[taskId] ?? null;
  },

  async create(options: {
    taskId: string;
    mainRepoPath: string;
    folderId: string;
    folderPath: string;
    mode: WorkspaceMode;
    branch?: string;
  }) {
    return trpcVanilla.workspace.create.mutate(options);
  },

  async delete(taskId: string, mainRepoPath: string) {
    return trpcVanilla.workspace.delete.mutate({ taskId, mainRepoPath });
  },

  async verify(taskId: string) {
    return trpcVanilla.workspace.verify.query({ taskId });
  },
};
