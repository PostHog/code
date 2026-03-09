import { buildPromptBlocks } from "@features/editor/utils/prompt-builder";
import {
  type ConnectParams,
  getSessionService,
} from "@features/sessions/service/service";
import { getTaskDirectory } from "@hooks/useRepositoryDirectory";
import type {
  Workspace,
  WorkspaceMode,
} from "@main/services/workspace/schemas";
import { Saga, type SagaLogger } from "@posthog/shared";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcVanilla } from "@renderer/trpc";
import { generateTitle } from "@renderer/utils/generateTitle";
import { getTaskRepository } from "@renderer/utils/repository";
import type { ExecutionMode, Task } from "@shared/types";
import { logger } from "@utils/logger";
import { queryClient } from "@utils/queryClient";
import striptags from "striptags";

const log = logger.scope("task-creation-saga");

function truncateToTitle(content: string): string {
  // Strip XML/HTML tags using a robust library to avoid incomplete sanitization
  const stripped = striptags(content).trim();
  if (!stripped) return "Untitled";
  if (stripped.length <= 80) return stripped;
  // Truncate at word boundary
  const truncated = stripped.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20
    ? `${truncated.slice(0, lastSpace)}...`
    : `${truncated}...`;
}

async function generateTaskTitle(
  taskId: string,
  description: string,
  posthogClient: PostHogAPIClient,
): Promise<void> {
  if (!description.trim()) return;

  const title = await generateTitle(description);
  if (!title) return;

  try {
    await posthogClient.updateTask(taskId, { title });

    // Update all cached task lists so the sidebar reflects the new title instantly
    queryClient.setQueriesData<Task[]>({ queryKey: ["tasks", "list"] }, (old) =>
      old?.map((task) => (task.id === taskId ? { ...task, title } : task)),
    );
  } catch (error) {
    log.error("Failed to save task title", { taskId, error });
  }
}

// Adapt our logger to SagaLogger interface
const sagaLogger: SagaLogger = {
  info: (message, data) => log.info(message, data),
  debug: (message, data) => log.debug(message, data),
  error: (message, data) => log.error(message, data),
  warn: (message, data) => log.warn(message, data),
};

export interface TaskCreationInput {
  // For opening existing task
  taskId?: string;
  // For creating new task (required if no taskId)
  content?: string;
  filePaths?: string[];
  repoPath?: string;
  repository?: string | null;
  workspaceMode?: WorkspaceMode;
  branch?: string | null;
  githubIntegrationId?: number;
  executionMode?: ExecutionMode;
  adapter?: "claude" | "codex";
  model?: string;
  reasoningLevel?: string;
}

export interface TaskCreationOutput {
  task: Task;
  workspace: Workspace | null;
}

export interface TaskCreationDeps {
  posthogClient: PostHogAPIClient;
}

export class TaskCreationSaga extends Saga<
  TaskCreationInput,
  TaskCreationOutput
> {
  readonly sagaName = "TaskCreationSaga";

  constructor(private deps: TaskCreationDeps) {
    super(sagaLogger);
  }

  protected async execute(
    input: TaskCreationInput,
  ): Promise<TaskCreationOutput> {
    // Step 1: Get or create task
    // For new tasks, start folder registration in parallel with task creation
    // since folder_registration only needs repoPath (from input), not task.id
    const taskId = input.taskId;
    const folderPromise =
      !taskId && input.repoPath
        ? this.resolveFolder(input.repoPath)
        : undefined;

    const task = taskId
      ? await this.readOnlyStep("fetch_task", () =>
          this.deps.posthogClient.getTask(taskId),
        )
      : await this.createTask(input);

    // Fire-and-forget: generate a proper LLM title for new tasks
    if (!taskId) {
      generateTaskTitle(task.id, input.content ?? "", this.deps.posthogClient);
    }

    const repoKey = getTaskRepository(task);
    const repoPath =
      input.repoPath ??
      (await this.readOnlyStep("resolve_repo_path", () =>
        getTaskDirectory(task.id, repoKey ?? undefined),
      ));

    // Step 3: Resolve workspaceMode - input takes precedence, then derive from task
    const workspaceMode =
      input.workspaceMode ??
      (task.latest_run?.environment === "cloud" ? "cloud" : "local");

    log.info("Task setup resolved", {
      taskId: task.id,
      isOpen: !!input.taskId,
      repository: repoKey,
      repoPath,
      workspaceMode,
      hasLatestRun: !!task.latest_run,
      latestRunLogUrl: task.latest_run?.log_url,
    });

    // Step 4: Create workspace if we have a directory
    let workspace: Workspace | null = null;
    const branch = input.branch ?? task.latest_run?.branch ?? null;

    if (repoPath) {
      // Use the pre-fetched folder if we started it in parallel, otherwise fetch now
      const folder = folderPromise
        ? await this.readOnlyStep("folder_registration", () => folderPromise)
        : await this.readOnlyStep("folder_registration", () =>
            this.resolveFolder(repoPath),
          );

      const workspaceInfo = await this.step({
        name: "workspace_creation",
        execute: async () => {
          return trpcVanilla.workspace.create.mutate({
            taskId: task.id,
            mainRepoPath: repoPath,
            folderId: folder.id,
            folderPath: repoPath,
            mode: workspaceMode,
            branch: branch ?? undefined,
          });
        },
        rollback: async () => {
          log.info("Rolling back: deleting workspace", { taskId: task.id });
          await trpcVanilla.workspace.delete.mutate({
            taskId: task.id,
            mainRepoPath: repoPath,
          });
        },
      });

      workspace = {
        taskId: task.id,
        folderId: folder.id,
        folderPath: repoPath,
        mode: workspaceMode,
        worktreePath: workspaceInfo.worktree?.worktreePath ?? null,
        worktreeName: workspaceInfo.worktree?.worktreeName ?? null,
        branchName: workspaceInfo.worktree?.branchName ?? null,
        baseBranch: workspaceInfo.worktree?.baseBranch ?? null,
        createdAt:
          workspaceInfo.worktree?.createdAt ?? new Date().toISOString(),
        terminalSessionIds: workspaceInfo.terminalSessionIds,
        hasStartScripts: workspaceInfo.hasStartScripts,
      };
    } else if (workspaceMode === "cloud") {
      await this.step({
        name: "cloud_workspace_creation",
        execute: async () => {
          return trpcVanilla.workspace.create.mutate({
            taskId: task.id,
            mainRepoPath: "",
            folderId: "",
            folderPath: "",
            mode: "cloud",
            branch: branch ?? undefined,
          });
        },
        rollback: async () => {
          log.info("Rolling back: deleting cloud workspace", {
            taskId: task.id,
          });
          await trpcVanilla.workspace.delete.mutate({
            taskId: task.id,
            mainRepoPath: "",
          });
        },
      });

      workspace = {
        taskId: task.id,
        folderId: "",
        folderPath: "",
        mode: "cloud",
        worktreePath: null,
        worktreeName: null,
        branchName: null,
        baseBranch: branch,
        createdAt: new Date().toISOString(),
        terminalSessionIds: [],
        hasStartScripts: false,
      };
    }

    // Step 5: Start cloud run (only for new cloud tasks)
    if (workspaceMode === "cloud" && !task.latest_run) {
      await this.step({
        name: "cloud_run",
        execute: () => this.deps.posthogClient.runTaskInCloud(task.id, branch),
        rollback: async () => {
          log.info("Rolling back: cloud run (no-op)", { taskId: task.id });
        },
      });
    }

    // Step 6: Connect to session
    // Cloud create: skip local session — the sandbox handles execution
    const agentCwd =
      workspace?.worktreePath ?? workspace?.folderPath ?? repoPath;
    const isCloudCreate = !input.taskId && workspaceMode === "cloud";
    const shouldConnect =
      !isCloudCreate &&
      (!!input.taskId || // Open: always connect to load chat history
        !!agentCwd); // Local create: always connect if we have a cwd

    if (shouldConnect) {
      const initialPrompt =
        !input.taskId && input.content
          ? await this.readOnlyStep("build_prompt_blocks", () =>
              buildPromptBlocks(
                input.content ?? "",
                input.filePaths ?? [],
                agentCwd ?? "",
              ),
            )
          : undefined;

      await this.step({
        name: "agent_session",
        execute: async () => {
          // Fire-and-forget for both open and create paths.
          // The UI handles "connecting" state with a spinner (TaskLogsPanel),
          // so we don't need to block the saga on the full reconnect chain.
          const connectParams: ConnectParams = {
            task,
            repoPath: agentCwd ?? "",
          };
          if (initialPrompt) connectParams.initialPrompt = initialPrompt;
          if (input.executionMode)
            connectParams.executionMode = input.executionMode;
          if (input.adapter) connectParams.adapter = input.adapter;
          if (input.model) connectParams.model = input.model;
          if (input.reasoningLevel)
            connectParams.reasoningLevel = input.reasoningLevel;

          getSessionService().connectToTask(connectParams);
          return { taskId: task.id };
        },
        rollback: async ({ taskId }) => {
          log.info("Rolling back: disconnecting agent session", { taskId });
          await getSessionService().disconnectFromTask(taskId);
        },
      });
    }

    return { task, workspace };
  }

  private async resolveFolder(repoPath: string) {
    const folders = await trpcVanilla.folders.getFolders.query();
    let existingFolder = folders.find((f) => f.path === repoPath);

    if (!existingFolder) {
      existingFolder = await trpcVanilla.folders.addFolder.mutate({
        folderPath: repoPath,
      });
    }
    return existingFolder;
  }

  private async createTask(input: TaskCreationInput): Promise<Task> {
    let repository = input.repository;

    const repoPathForDetection = input.repoPath;
    if (!repository && repoPathForDetection) {
      const detected = await this.readOnlyStep("repo_detection", () =>
        trpcVanilla.git.detectRepo.query({
          directoryPath: repoPathForDetection,
        }),
      );
      if (detected) {
        repository = `${detected.organization}/${detected.repository}`;
      }
    }

    return this.step({
      name: "task_creation",
      execute: async () => {
        const result = await this.deps.posthogClient.createTask({
          title: truncateToTitle(input.content ?? ""),
          description: input.content ?? "",
          repository: repository ?? undefined,
          github_integration:
            input.workspaceMode === "cloud"
              ? input.githubIntegrationId
              : undefined,
        });
        return result as unknown as Task;
      },
      rollback: async (createdTask) => {
        log.info("Rolling back: deleting task", { taskId: createdTask.id });
        await this.deps.posthogClient.deleteTask(createdTask.id);
      },
    });
  }
}
