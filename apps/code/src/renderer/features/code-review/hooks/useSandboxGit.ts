import { useAuthState } from "@features/auth/hooks/authQueries";
import type { DiffStats } from "@features/git-interaction/utils/diffStats";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { trpcClient } from "@renderer/trpc/client";
import type { ChangedFile } from "@shared/types";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

interface SandboxChangedFilesResult {
  files: ChangedFile[];
}

interface SandboxDiffResult {
  diff: string;
}

// --- Cloud command context ---

interface CloudCommandContext {
  taskId: string;
  runId: string;
  apiHost: string;
  teamId: number;
}

export function useCloudCommandContext(
  taskId: string | undefined,
): CloudCommandContext | null {
  const taskRunId = useSessionStore((s) => {
    if (!taskId) return undefined;
    return s.taskIdIndex[taskId];
  });
  const { data: authState } = useAuthState();
  const cloudRegion = authState?.cloudRegion ?? null;
  const projectId = authState?.projectId ?? null;

  return useMemo(() => {
    if (!taskId || !taskRunId || !cloudRegion || !projectId) {
      return null;
    }
    return {
      taskId,
      runId: taskRunId,
      apiHost: getCloudUrlFromRegion(cloudRegion),
      teamId: projectId,
    };
  }, [taskId, taskRunId, cloudRegion, projectId]);
}

export async function sendSandboxCommand<T>(
  ctx: CloudCommandContext,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const result = await trpcClient.cloudTask.sendCommand.mutate({
    taskId: ctx.taskId,
    runId: ctx.runId,
    apiHost: ctx.apiHost,
    teamId: ctx.teamId,
    method: method as "git/changed_files",
    params,
  });

  if (!result.success) {
    throw new Error(result.error ?? `Sandbox command ${method} failed`);
  }

  return result.result as T;
}

// --- Query hooks ---

/**
 * Fetches changed files from the sandbox. Returns the same ChangedFile[]
 * shape as the local `trpc.git.getChangedFilesHead` query.
 */
export function useSandboxChangedFiles(
  taskId: string | undefined,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  const ctx = useCloudCommandContext(taskId);

  return useQuery<ChangedFile[]>({
    queryKey: ["sandbox", "git_changed_files", taskId],
    queryFn: async () => {
      if (!ctx) throw new Error("No cloud context");
      const result = await sendSandboxCommand<SandboxChangedFilesResult>(
        ctx,
        "git/changed_files",
      );
      return result.files;
    },
    enabled: (options?.enabled ?? true) && !!ctx,
    staleTime: 10_000,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Fetches staged diff (git diff --cached) from the sandbox.
 */
export function useSandboxDiffCached(
  taskId: string | undefined,
  options?: { enabled?: boolean; ignoreWhitespace?: boolean },
) {
  const ctx = useCloudCommandContext(taskId);

  return useQuery<string>({
    queryKey: ["sandbox", "git_diff_cached", taskId, options?.ignoreWhitespace],
    queryFn: async () => {
      if (!ctx) throw new Error("No cloud context");
      const result = await sendSandboxCommand<SandboxDiffResult>(
        ctx,
        "git/diff_cached",
        { ignoreWhitespace: options?.ignoreWhitespace },
      );
      return result.diff;
    },
    enabled: (options?.enabled ?? true) && !!ctx,
    staleTime: 10_000,
  });
}

/**
 * Fetches unstaged diff from the sandbox.
 */
export function useSandboxDiffUnstaged(
  taskId: string | undefined,
  options?: { enabled?: boolean; ignoreWhitespace?: boolean },
) {
  const ctx = useCloudCommandContext(taskId);

  return useQuery<string>({
    queryKey: [
      "sandbox",
      "git_diff_unstaged",
      taskId,
      options?.ignoreWhitespace,
    ],
    queryFn: async () => {
      if (!ctx) throw new Error("No cloud context");
      const result = await sendSandboxCommand<SandboxDiffResult>(
        ctx,
        "git/diff_unstaged",
        { ignoreWhitespace: options?.ignoreWhitespace },
      );
      return result.diff;
    },
    enabled: (options?.enabled ?? true) && !!ctx,
    staleTime: 10_000,
  });
}

/**
 * Fetches diff stats from the sandbox.
 */
export function useSandboxDiffStats(
  taskId: string | undefined,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  const ctx = useCloudCommandContext(taskId);

  return useQuery<DiffStats>({
    queryKey: ["sandbox", "git_diff_stats", taskId],
    queryFn: async () => {
      if (!ctx) throw new Error("No cloud context");
      return sendSandboxCommand<DiffStats>(ctx, "git/diff_stats");
    },
    enabled: (options?.enabled ?? true) && !!ctx,
    staleTime: 10_000,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Invalidate all sandbox git query caches for a task.
 */
export function useInvalidateSandboxQueries(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (!taskId) return;
    void queryClient.invalidateQueries({
      queryKey: ["sandbox"],
      predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[2] === taskId,
    });
  }, [queryClient, taskId]);
}
