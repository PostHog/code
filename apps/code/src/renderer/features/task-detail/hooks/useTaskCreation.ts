import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { buildCloudTaskDescription } from "@features/editor/utils/cloud-prompt";
import { useTaskInputHistoryStore } from "@features/message-editor/stores/taskInputHistoryStore";
import type { EditorHandle } from "@features/message-editor/types";
import {
  contentToXml,
  extractFilePaths,
} from "@features/message-editor/utils/content";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useConnectivity } from "@hooks/useConnectivity";
import type { WorkspaceMode } from "@main/services/workspace/schemas";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { toast } from "@renderer/utils/toast";
import type { ExecutionMode, Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { logger } from "@utils/logger";
import { useCallback, useState } from "react";
import type { TaskCreationInput, TaskService } from "../service/service";

const log = logger.scope("task-creation");

interface UseTaskCreationOptions {
  editorRef: React.RefObject<EditorHandle | null>;
  selectedDirectory: string;
  selectedRepository?: string | null;
  githubIntegrationId?: number;
  workspaceMode: WorkspaceMode;
  branch?: string | null;
  editorIsEmpty: boolean;
  executionMode?: ExecutionMode;
  adapter?: "claude" | "codex";
  model?: string;
  reasoningLevel?: string;
  environmentId?: string | null;
  sandboxEnvironmentId?: string;
  onTaskCreated?: (task: Task) => void;
}

interface UseTaskCreationReturn {
  isCreatingTask: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
}

function prepareTaskInput(
  content: Parameters<typeof contentToXml>[0],
  options: {
    selectedDirectory: string;
    selectedRepository?: string | null;
    githubIntegrationId?: number;
    workspaceMode: WorkspaceMode;
    branch?: string | null;
    executionMode?: ExecutionMode;
    adapter?: "claude" | "codex";
    model?: string;
    reasoningLevel?: string;
    environmentId?: string | null;
    sandboxEnvironmentId?: string;
  },
): TaskCreationInput {
  const serializedContent = contentToXml(content).trim();
  const filePaths = extractFilePaths(content);

  return {
    content: serializedContent,
    taskDescription:
      options.workspaceMode === "cloud"
        ? buildCloudTaskDescription(serializedContent, filePaths)
        : undefined,
    filePaths,
    repoPath: options.selectedDirectory,
    repository: options.selectedRepository,
    githubIntegrationId: options.githubIntegrationId,
    workspaceMode: options.workspaceMode,
    branch: options.branch,
    executionMode: options.executionMode,
    adapter: options.adapter,
    model: options.model,
    reasoningLevel: options.reasoningLevel,
    environmentId: options.environmentId ?? undefined,
    sandboxEnvironmentId: options.sandboxEnvironmentId,
  };
}

function getErrorTitle(failedStep: string): string {
  const titles: Record<string, string> = {
    repo_detection: "Failed to detect repository",
    task_creation: "Failed to create task",
    workspace_creation: "Failed to create workspace",
    cloud_prompt_preparation: "Failed to prepare cloud attachments",
    cloud_run: "Failed to start cloud execution",
    agent_session: "Failed to start agent session",
  };
  return titles[failedStep] ?? "Task creation failed";
}

export function useTaskCreation({
  editorRef,
  selectedDirectory,
  selectedRepository,
  githubIntegrationId,
  workspaceMode,
  branch,
  editorIsEmpty,
  executionMode,
  adapter,
  model,
  reasoningLevel,
  environmentId,
  sandboxEnvironmentId,
  onTaskCreated,
}: UseTaskCreationOptions): UseTaskCreationReturn {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const { navigateToTask } = useNavigationStore();
  const isAuthenticated = useAuthStateValue(
    (state) => state.status === "authenticated",
  );
  const { invalidateTasks } = useCreateTask();
  const { isOnline } = useConnectivity();

  const hasRequiredPath =
    workspaceMode === "cloud" ? !!selectedRepository : !!selectedDirectory;
  const canSubmit =
    !!editorRef.current &&
    isAuthenticated &&
    isOnline &&
    hasRequiredPath &&
    !isCreatingTask &&
    !editorIsEmpty;

  const handleSubmit = useCallback(async () => {
    const editor = editorRef.current;
    if (!canSubmit || !editor) return;

    setIsCreatingTask(true);

    try {
      const content = editor.getContent();

      const plainText = editor.getText()?.trim();
      if (plainText) {
        useTaskInputHistoryStore.getState().addPrompt(plainText);
      }

      const input = prepareTaskInput(content, {
        selectedDirectory,
        selectedRepository,
        githubIntegrationId,
        workspaceMode,
        branch,
        executionMode,
        adapter,
        model,
        reasoningLevel,
        environmentId,
        sandboxEnvironmentId,
      });

      if (executionMode) {
        useSettingsStore.getState().setLastUsedInitialTaskMode(executionMode);
      }

      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
      const result = await taskService.createTask(input, (output) => {
        invalidateTasks(output.task);
        if (onTaskCreated) {
          onTaskCreated(output.task);
        } else {
          navigateToTask(output.task);
        }
        editor.clear();
      });

      if (!result.success) {
        const title = getErrorTitle(result.failedStep);
        toast.error(title, { description: result.error });
        log.error("Task creation failed", {
          failedStep: result.failedStep,
          error: result.error,
        });
      }
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to create task", { description });
      log.error("Unexpected error during task creation", { error });
    } finally {
      setIsCreatingTask(false);
    }
  }, [
    canSubmit,
    editorRef,
    selectedDirectory,
    selectedRepository,
    githubIntegrationId,
    workspaceMode,
    branch,
    executionMode,
    adapter,
    model,
    reasoningLevel,
    environmentId,
    sandboxEnvironmentId,
    invalidateTasks,
    navigateToTask,
    onTaskCreated,
  ]);

  return {
    isCreatingTask,
    canSubmit,
    handleSubmit,
  };
}
