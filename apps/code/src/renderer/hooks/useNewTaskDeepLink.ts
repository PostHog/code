import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { useTaskInputHistoryStore } from "@features/message-editor/stores/taskInputHistoryStore";
import { contentToXml } from "@features/message-editor/utils/content";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import type {
  TaskCreationInput,
  TaskService,
} from "@features/task-detail/service/service";
import type { NewTaskLinkPayload } from "@main/services/new-task-link/service";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { trpcClient, useTRPC } from "@renderer/trpc";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { track } from "@utils/analytics";
import { logger } from "@utils/logger";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const log = logger.scope("new-task-deep-link");

const taskListKey = ["tasks", "list"] as const;

/**
 * Hook that subscribes to new-task deep link events
 * (`<scheme>://new?prompt=...&repo=...&auto=1&...`).
 *
 * Default behavior: navigates to the new-task screen and pre-fills the editor
 * with the supplied prompt so the user can review and submit. With `auto=1`,
 * runs the existing TaskCreationSaga directly using the supplied flags.
 */
export function useNewTaskDeepLink() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStateValue(
    (s) => s.status === "authenticated",
  );
  const navigateToTask = useNavigationStore((s) => s.navigateToTask);
  const navigateToTaskInput = useNavigationStore((s) => s.navigateToTaskInput);
  const pendingDrainedRef = useRef(false);

  const handleOpenNewTask = useCallback(
    async (payload: NewTaskLinkPayload) => {
      log.info("Handling new-task deep link", {
        auto: payload.auto,
        repo: payload.repo,
        hasModel: !!payload.model,
      });

      const settings = useSettingsStore.getState();
      if (payload.adapter) {
        settings.setLastUsedAdapter(payload.adapter);
      }
      if (payload.mode) {
        settings.setLastUsedWorkspaceMode(payload.mode);
      }

      let folderId: string | undefined;
      if (payload.repo) {
        try {
          const folder = await trpcClient.folders.addFolder.mutate({
            folderPath: payload.repo,
          });
          folderId = folder.id;
        } catch (error) {
          log.error("Failed to register folder for new-task link", {
            error,
            repo: payload.repo,
          });
          if (payload.auto) {
            toast.error("Failed to register folder", {
              description: payload.repo,
            });
            return;
          }
        }
      }

      if (payload.auto) {
        await runAutoCreate(payload, queryClient, navigateToTask);
        return;
      }

      navigateToTaskInput(folderId);
      useDraftStore.getState().actions.setPendingContent("task-input", {
        segments: [{ type: "text", text: payload.prompt }],
      });
    },
    [navigateToTask, navigateToTaskInput, queryClient],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      pendingDrainedRef.current = false;
      return;
    }
    if (pendingDrainedRef.current) return;
    pendingDrainedRef.current = true;

    void (async () => {
      try {
        const pending = await trpcClient.deepLink.getPendingNewTaskLink.query();
        if (pending) await handleOpenNewTask(pending);
      } catch (error) {
        log.error("Failed to check for pending new-task deep link", { error });
      }
    })();
  }, [isAuthenticated, handleOpenNewTask]);

  useSubscription(
    trpcReact.deepLink.onOpenNewTask.subscriptionOptions(undefined, {
      onData: (data) => {
        if (data?.prompt) void handleOpenNewTask(data);
      },
    }),
  );
}

async function runAutoCreate(
  payload: NewTaskLinkPayload,
  queryClient: ReturnType<typeof useQueryClient>,
  navigateToTask: ReturnType<
    typeof useNavigationStore.getState
  >["navigateToTask"],
): Promise<void> {
  try {
    const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
    const xml = contentToXml({
      segments: [{ type: "text", text: payload.prompt }],
    }).trim();

    const input: TaskCreationInput = {
      content: xml,
      taskDescription: payload.prompt,
      repoPath: payload.repo,
      workspaceMode: payload.mode,
      branch: payload.branch ?? null,
      adapter: payload.adapter,
      model: payload.model,
      reasoningLevel: payload.effort,
    };

    const result = await taskService.createTask(input, (output) => {
      useTaskInputHistoryStore.getState().addPrompt(payload.prompt);
      void queryClient.invalidateQueries({ queryKey: taskListKey });
      navigateToTask(output.task);
      track(ANALYTICS_EVENTS.TASK_CREATED, {
        auto_run: true,
        created_from: "cli",
        repository_provider: payload.repo ? "local" : "none",
      });
    });

    if (!result.success) {
      log.error("Auto-create task failed", {
        error: result.error,
        failedStep: result.failedStep,
      });
      toast.error("Failed to create task", { description: result.error });
    }
  } catch (error) {
    log.error("Unexpected error auto-creating task from deep link", { error });
    toast.error("Failed to create task");
  }
}
