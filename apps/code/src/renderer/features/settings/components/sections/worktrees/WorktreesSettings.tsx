import { useFolders } from "@features/folders/hooks/useFolders";
import { SettingRow } from "@features/settings/components/SettingRow";
import { useSuspensionSettings } from "@features/suspension/hooks/useSuspensionSettings";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { trpcClient, useTRPC } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useCallback, useMemo, useState } from "react";
import type { WorktreeGroup } from "./WorktreeGroupSection";
import { WorktreeGroupSection } from "./WorktreeGroupSection";

const log = logger.scope("worktrees-settings");

export function WorktreesSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useSuspensionSettings();
  const deleteWorkspaceMutation = useMutation(
    trpc.workspace.delete.mutationOptions(),
  );
  const { mutateAsync: deleteTask } = useDeleteTask();
  const [deletingWorktrees, setDeletingWorktrees] = useState<Set<string>>(
    new Set(),
  );

  const { folders } = useFolders();
  const { data: tasks } = useTasks();

  const worktreeQueries = useQueries({
    queries: folders.map((folder) =>
      trpc.workspace.listGitWorktrees.queryOptions(
        { mainRepoPath: folder.path },
        { staleTime: 30_000 },
      ),
    ),
  });

  const worktreeGroups = useMemo(() => {
    const groups: WorktreeGroup[] = [];

    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const query = worktreeQueries[i];

      if (!query?.data || query.data.length === 0) continue;

      groups.push({
        folderPath: folder.path,
        worktrees: query.data.map((wt) => ({
          worktreePath: wt.worktreePath,
          head: wt.head,
          branch: wt.branch,
          taskIds: wt.taskIds,
        })),
      });
    }

    return groups.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  }, [folders, worktreeQueries]);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    if (tasks) {
      for (const task of tasks) {
        map.set(task.id, task);
      }
    }
    return map;
  }, [tasks]);

  const handleDeleteWorktree = useCallback(
    async (
      worktreePath: string,
      allTaskIds: string[],
      existingTaskIds: string[],
      folderPath: string,
    ) => {
      if (existingTaskIds.length > 0) {
        const result =
          await trpcClient.contextMenu.confirmDeleteWorktree.mutate({
            worktreePath,
            linkedTaskCount: existingTaskIds.length,
          });
        if (!result.confirmed) return;
      }

      setDeletingWorktrees((prev) => new Set(prev).add(worktreePath));

      try {
        if (allTaskIds.length > 0) {
          for (const taskId of allTaskIds) {
            await deleteWorkspaceMutation.mutateAsync({
              taskId,
              mainRepoPath: folderPath,
            });
          }
        } else {
          await trpcClient.workspace.deleteWorktree.mutate({
            worktreePath,
            mainRepoPath: folderPath,
          });
        }

        for (const taskId of existingTaskIds) {
          await deleteTask(taskId);
        }

        await Promise.all([
          queryClient.invalidateQueries(trpc.workspace.getAll.pathFilter()),
          queryClient.invalidateQueries(
            trpc.workspace.listGitWorktrees.queryFilter({
              mainRepoPath: folderPath,
            }),
          ),
        ]);
      } catch (error) {
        log.error("Failed to delete worktree:", error);
      } finally {
        setDeletingWorktrees((prev) => {
          const next = new Set(prev);
          next.delete(worktreePath);
          return next;
        });
      }
    },
    [deleteWorkspaceMutation, deleteTask, queryClient, trpc],
  );

  const commitNumericField = useCallback(
    (
      e:
        | React.FocusEvent<HTMLInputElement>
        | React.KeyboardEvent<HTMLInputElement>,
      field: "maxActiveWorktrees" | "autoSuspendAfterDays",
      fallback: number,
    ) => {
      const input = e.currentTarget;
      const val = Number.parseInt(input.value, 10);
      const labels: Record<string, string> = {
        maxActiveWorktrees: "Max active worktrees",
        autoSuspendAfterDays: "Auto-suspend days",
      };
      if (val >= 1) {
        updateSettings({ [field]: val });
        toast.success(`${labels[field]} updated to ${val}`);
      } else {
        input.value = String(settings?.[field] ?? fallback);
      }
    },
    [settings, updateSettings],
  );

  const isLoading = worktreeQueries.some((q) => q.isLoading);

  return (
    <Flex direction="column" gap="5">
      <Flex direction="column">
        <SettingRow
          label="Automatically suspend stale worktrees"
          description="Suspend stale worktrees to save disk space. Suspended worktrees can be restored at any time. Only disable if you prefer to manage worktrees manually."
        >
          <Switch
            checked={settings.autoSuspendEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ autoSuspendEnabled: checked })
            }
            size="1"
          />
        </SettingRow>
        <SettingRow
          label="Max active worktrees"
          description="When this limit is reached, the least recently active worktree will be automatically suspended"
        >
          <TextField.Root
            key={`max-${settings.maxActiveWorktrees}`}
            type="number"
            size="1"
            min={1}
            disabled={!settings.autoSuspendEnabled}
            defaultValue={settings.maxActiveWorktrees}
            onBlur={(e) => commitNumericField(e, "maxActiveWorktrees", 5)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                commitNumericField(e, "maxActiveWorktrees", 5);
            }}
            className="w-[64px]"
          />
        </SettingRow>
        <SettingRow
          label="Auto-suspend after inactivity"
          description="Suspend worktrees with no activity for this many days"
          noBorder
        >
          <TextField.Root
            key={`days-${settings.autoSuspendAfterDays}`}
            type="number"
            size="1"
            min={1}
            disabled={!settings.autoSuspendEnabled}
            defaultValue={settings.autoSuspendAfterDays}
            onBlur={(e) => commitNumericField(e, "autoSuspendAfterDays", 7)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                commitNumericField(e, "autoSuspendAfterDays", 7);
            }}
            className="w-[64px]"
          />
        </SettingRow>
      </Flex>

      {isLoading ? (
        <Text color="gray" className="text-sm">
          Loading worktrees...
        </Text>
      ) : worktreeGroups.length === 0 ? (
        <Text color="gray" className="text-[13px]">
          Tasks that are run in a worktree will show up here.
        </Text>
      ) : (
        worktreeGroups.map((group) => (
          <WorktreeGroupSection
            key={group.folderPath}
            group={group}
            taskMap={taskMap}
            deletingWorktrees={deletingWorktrees}
            onDelete={handleDeleteWorktree}
          />
        ))
      )}
    </Flex>
  );
}
