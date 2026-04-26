import { buildPromptBlocks } from "@features/editor/utils/prompt-builder";
import {
  type ConnectParams,
  getSessionService,
} from "@features/sessions/service/service";
import type { Workspace } from "@main/services/workspace/schemas";
import { Saga, type SagaLogger } from "@posthog/shared";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc";
import type { ExecutionMode, Task } from "@shared/types";
import { logger } from "@utils/logger";
import { buildScaffoldingPrompt } from "./scaffolding-prompt";

const log = logger.scope("scratchpad-creation-saga");

const sagaLogger: SagaLogger = {
  info: (message, data) => log.info(message, data),
  debug: (message, data) => log.debug(message, data),
  error: (message, data) => log.error(message, data),
  warn: (message, data) => log.warn(message, data),
};

export interface ScratchpadCreationInput {
  productName: string;
  initialIdea: string;
  /** Clamped 1..5 by the caller. */
  rounds: number;
  /**
   * Mutually exclusive with `autoCreateProject`. If provided, the user picked
   * an existing project — the saga will NOT delete it on rollback.
   */
  projectId?: number;
  /**
   * Mutually exclusive with `projectId`. When set, the saga creates a new
   * project named `[UNPUBLISHED] {productName}` in the given organisation
   * and rolls back by deleting it.
   */
  autoCreateProject?: {
    organizationId: string;
  };
  /** Optional agent execution preferences forwarded to `connectToTask`. */
  adapter?: "claude" | "codex";
  model?: string;
  reasoningLevel?: string;
  executionMode?: ExecutionMode;
}

export interface ScratchpadCreationOutput {
  task: Task;
  workspace: Workspace;
  scratchpadPath: string;
  projectId: number;
  autoCreatedProject: boolean;
}

export interface ScratchpadCreationDeps {
  posthogClient: PostHogAPIClient;
  onTaskReady?: (output: { task: Task; workspace: Workspace }) => void;
}

export class ScratchpadCreationSaga extends Saga<
  ScratchpadCreationInput,
  ScratchpadCreationOutput
> {
  readonly sagaName = "ScratchpadCreationSaga";

  constructor(private deps: ScratchpadCreationDeps) {
    super(sagaLogger);
  }

  protected async execute(
    input: ScratchpadCreationInput,
  ): Promise<ScratchpadCreationOutput> {
    if (!input.projectId && !input.autoCreateProject) {
      throw new Error(
        "ScratchpadCreationInput requires either projectId or autoCreateProject",
      );
    }
    if (input.projectId && input.autoCreateProject) {
      throw new Error(
        "ScratchpadCreationInput: projectId and autoCreateProject are mutually exclusive",
      );
    }

    // Step 1: Optional project creation
    let projectId: number;
    let autoCreatedProject = false;

    if (input.autoCreateProject) {
      const organizationId = input.autoCreateProject.organizationId;
      const created = await this.step({
        name: "posthog_project",
        execute: async () => {
          const project = await this.deps.posthogClient.createProject({
            name: `[UNPUBLISHED] ${input.productName}`,
            organizationId,
          });
          if (typeof project.id !== "number") {
            throw new Error(
              "createProject did not return a numeric project id",
            );
          }
          return { id: project.id as number };
        },
        rollback: async (createdProject) => {
          log.info("Rolling back: deleting auto-created project", {
            projectId: createdProject.id,
          });
          await this.deps.posthogClient.deleteProject(createdProject.id);
        },
      });
      projectId = created.id;
      autoCreatedProject = true;
    } else {
      // biome-ignore lint/style/noNonNullAssertion: validated above
      projectId = input.projectId!;
    }

    // Step 2: Task creation. The product name is the title verbatim.
    const task = await this.step({
      name: "task_creation",
      execute: async () => {
        const result = await this.deps.posthogClient.createTask({
          description: input.initialIdea,
          title: input.productName,
          repository: undefined,
        });
        return result as unknown as Task;
      },
      rollback: async (createdTask) => {
        log.info("Rolling back: deleting task", { taskId: createdTask.id });
        await this.deps.posthogClient.deleteTask(createdTask.id);
      },
    });

    // Step 3: Scratchpad directory + manifest. Service writes manifest atomically.
    const { scratchpadPath } = await this.step({
      name: "scratchpad_dir",
      execute: async () => {
        return trpcClient.scratchpad.create.mutate({
          taskId: task.id,
          name: input.productName,
          projectId,
        });
      },
      rollback: async () => {
        log.info("Rolling back: deleting scratchpad directory", {
          taskId: task.id,
        });
        await trpcClient.scratchpad.delete.mutate({ taskId: task.id });
      },
    });

    // Step 4: Workspace creation pointed at the scratchpad path. We use the
    // scratchpad path as a synthetic folderId — it's a stable identifier and
    // the workspace service treats local-mode workspaces with a missing
    // repository row as having no associated repo (folderId is just an
    // opaque string at the input layer).
    const workspaceInfo = await this.step({
      name: "workspace_creation",
      execute: async () => {
        return trpcClient.workspace.create.mutate({
          taskId: task.id,
          mainRepoPath: scratchpadPath,
          folderId: scratchpadPath,
          folderPath: scratchpadPath,
          mode: "local",
          scratchpad: true,
        });
      },
      rollback: async () => {
        log.info("Rolling back: deleting workspace", { taskId: task.id });
        await trpcClient.workspace.delete.mutate({
          taskId: task.id,
          mainRepoPath: scratchpadPath,
        });
      },
    });

    const workspace: Workspace = {
      taskId: task.id,
      folderId: scratchpadPath,
      folderPath: scratchpadPath,
      mode: "local",
      worktreePath: workspaceInfo.worktree?.worktreePath ?? null,
      worktreeName: workspaceInfo.worktree?.worktreeName ?? null,
      branchName: workspaceInfo.worktree?.branchName ?? null,
      baseBranch: workspaceInfo.worktree?.baseBranch ?? null,
      linkedBranch: workspaceInfo.linkedBranch ?? null,
      createdAt: workspaceInfo.worktree?.createdAt ?? new Date().toISOString(),
      scratchpad: true,
    };

    if (this.deps.onTaskReady) {
      this.deps.onTaskReady({ task, workspace });
    }

    // Step 5: Agent session connection with scaffolding prompt as initial message.
    const scaffoldingPromptText = buildScaffoldingPrompt({
      scratchpadPath,
      initialIdea: input.initialIdea,
      productName: input.productName,
      rounds: input.rounds,
      projectId,
      taskId: task.id,
    });

    const initialPrompt = await buildPromptBlocks(
      scaffoldingPromptText,
      [],
      scratchpadPath,
    );

    await this.step({
      name: "agent_session",
      execute: async () => {
        const connectParams: ConnectParams = {
          task,
          repoPath: scratchpadPath,
          initialPrompt,
        };
        if (input.executionMode)
          connectParams.executionMode = input.executionMode;
        if (input.adapter) connectParams.adapter = input.adapter;
        if (input.model) connectParams.model = input.model;
        if (input.reasoningLevel)
          connectParams.reasoningLevel = input.reasoningLevel;

        await getSessionService().connectToTask(connectParams);
        return { taskId: task.id };
      },
      rollback: async ({ taskId }) => {
        log.info("Rolling back: disconnecting agent session", { taskId });
        await getSessionService().disconnectFromTask(taskId);
      },
    });

    return {
      task,
      workspace,
      scratchpadPath,
      projectId,
      autoCreatedProject,
    };
  }
}
