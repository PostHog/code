import type { ContentBlock } from "@agentclientprotocol/sdk";
import { buildPromptBlocks } from "@features/editor/utils/prompt-builder";
import type { Workspace } from "@main/services/workspace/schemas";
import { Saga } from "@posthog/shared";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc";
import type { ExecutionMode, Task } from "@shared/types";
import { logger } from "@utils/logger";
import { createSagaLogger } from "../sagaLogger";
import { taskCreationStepConfig } from "../taskCreationStep";
import { buildScaffoldingPrompt } from "./scaffolding-prompt";

const log = logger.scope("scratchpad-creation-saga");
const sagaLogger = createSagaLogger("scratchpad-creation-saga");

export interface ScratchpadCreationInput {
  productName: string;
  initialIdea: string;
  /**
   * Maximum number of Socratic clarification rounds the agent runs before
   * scaffolding. Forwarded into the scaffolding prompt as a budget hint —
   * Claude's native `AskUserQuestion` tool drives the actual interaction.
   */
  rounds: number;
  /**
   * Optional. When provided, the user picked an existing project — the saga
   * will NOT delete it on rollback. When omitted, the manifest's `projectId`
   * is `null` and the user picks/creates a project at publish time.
   */
  projectId?: number;
  /**
   * Optional file paths the user attached. Surface as `resource_link` blocks
   * in the agent's first turn so the agent can read them while clarifying.
   */
  filePaths?: string[];
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
  /** `null` when no project is linked at creation time. */
  projectId: number | null;
  /**
   * Pre-built scaffolding prompt for the agent's first turn. The caller is
   * responsible for invoking `connectToTask({ task, repoPath, initialPrompt
   * })` AFTER the saga returns — agent connection is intentionally NOT a
   * saga step so a slow/failing connect can't roll back the task and
   * scratchpad after the user has already navigated to them.
   */
  initialPrompt: ContentBlock[];
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
    const projectId: number | null = input.projectId ?? null;

    // Step 1: Task creation.
    const task = await this.step({
      name: "task_creation",
      ...taskCreationStepConfig(
        this.deps.posthogClient,
        {
          description: input.initialIdea,
          title: `Building ${input.productName}`,
          repository: undefined,
        },
        log,
      ),
    });

    // Step 2: Scratchpad directory + manifest. Service writes manifest atomically.
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

    // Step 3: Register the scratchpad as a folder so navigateToTask and
    // other folder-aware UI can find it. Without this, the task-detail
    // screen's folder lookup falls into an auto-recreate branch and the
    // user lands on a blank "Select repository folder" view.
    const folder = await this.readOnlyStep("folder_registration", () =>
      trpcClient.folders.addFolder.mutate({ folderPath: scratchpadPath }),
    );

    // Step 4: Workspace creation pointed at the scratchpad path.
    const workspaceInfo = await this.step({
      name: "workspace_creation",
      execute: async () => {
        return trpcClient.workspace.create.mutate({
          taskId: task.id,
          mainRepoPath: scratchpadPath,
          folderId: folder.id,
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
      folderId: folder.id,
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

    // Build the agent's first-turn prompt. The caller calls connectToTask
    // separately so a slow/failing agent connect doesn't trigger a saga
    // rollback after the user has already navigated to the task.
    const scaffoldingPromptText = buildScaffoldingPrompt({
      scratchpadPath,
      initialIdea: input.initialIdea,
      productName: input.productName,
      projectId,
      taskId: task.id,
      rounds: input.rounds,
    });
    const initialPrompt = await buildPromptBlocks(
      scaffoldingPromptText,
      input.filePaths ?? [],
      scratchpadPath,
    );

    return {
      task,
      workspace,
      scratchpadPath,
      projectId,
      initialPrompt,
    };
  }
}
