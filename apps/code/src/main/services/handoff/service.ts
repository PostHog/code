import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MAIN_TOKENS } from "@main/di/tokens";
import { logger } from "@main/utils/logger";
import { TypedEventEmitter } from "@main/utils/typed-event-emitter";
import { HandoffCheckpointTracker } from "@posthog/agent/handoff-checkpoint";
import { PostHogAPIClient } from "@posthog/agent/posthog-api";
import { TreeTracker } from "@posthog/agent/tree-tracker";
import type * as AgentTypes from "@posthog/agent/types";
import {
  type GitHandoffBranchDivergence,
  readHandoffLocalGitState,
} from "@posthog/git/handoff";
import type { IAppLifecycle } from "@posthog/platform/app-lifecycle";
import type { IDialog } from "@posthog/platform/dialog";
import { inject, injectable } from "inversify";
import type { IWorkspaceRepository } from "../../db/repositories/workspace-repository";
import type { AgentAuthAdapter } from "../agent/auth-adapter";
import type { AgentService } from "../agent/service";
import type { CloudTaskService } from "../cloud-task/service";
import type { GitService } from "../git/service";
import { HandoffSaga, type HandoffSagaDeps } from "./handoff-saga";
import {
  HandoffEvent,
  type HandoffExecuteInput,
  type HandoffExecuteResult,
  type HandoffPreflightInput,
  type HandoffPreflightResult,
  type HandoffServiceEvents,
} from "./schemas";

const log = logger.scope("handoff");
const CONTINUE_DIVERGENCE_BUTTON = 1;

@injectable()
export class HandoffService extends TypedEventEmitter<HandoffServiceEvents> {
  constructor(
    @inject(MAIN_TOKENS.GitService) private readonly gitService: GitService,
    @inject(MAIN_TOKENS.AgentService)
    private readonly agentService: AgentService,
    @inject(MAIN_TOKENS.CloudTaskService)
    private readonly cloudTaskService: CloudTaskService,
    @inject(MAIN_TOKENS.AgentAuthAdapter)
    private readonly agentAuthAdapter: AgentAuthAdapter,
    @inject(MAIN_TOKENS.WorkspaceRepository)
    private readonly workspaceRepo: IWorkspaceRepository,
    @inject(MAIN_TOKENS.Dialog)
    private readonly dialog: IDialog,
    @inject(MAIN_TOKENS.AppLifecycle)
    private readonly appLifecycle: IAppLifecycle,
  ) {
    super();
  }

  async preflight(
    input: HandoffPreflightInput,
  ): Promise<HandoffPreflightResult> {
    const { repoPath } = input;

    let localTreeDirty = false;
    let localGitState: AgentTypes.HandoffLocalGitState | undefined;
    try {
      const changedFiles = await this.gitService.getChangedFilesHead(repoPath);
      localTreeDirty = changedFiles.length > 0;
      localGitState = await this.getLocalGitState(repoPath);
    } catch (err) {
      log.warn("Failed to check local working tree", { repoPath, err });
    }

    const canHandoff = !localTreeDirty;
    const reason = localTreeDirty
      ? "Local working tree has uncommitted changes. Commit or stash them first."
      : undefined;

    return { canHandoff, reason, localTreeDirty, localGitState };
  }

  async execute(input: HandoffExecuteInput): Promise<HandoffExecuteResult> {
    const deps: HandoffSagaDeps = {
      createApiClient: (apiHost: string, teamId: number) => {
        const config = this.agentAuthAdapter.createPosthogConfig({
          apiHost,
          projectId: teamId,
        });
        return new PostHogAPIClient(config);
      },

      applyTreeSnapshot: async (
        snapshot: AgentTypes.TreeSnapshotEvent,
        repoPath: string,
        taskId: string,
        runId: string,
        apiClient: PostHogAPIClient,
      ) => {
        const tracker = new TreeTracker({
          repositoryPath: repoPath,
          taskId,
          runId,
          apiClient,
        });
        await tracker.applyTreeSnapshot({
          ...snapshot,
          baseCommit: null,
        });
      },

      applyGitCheckpoint: async (
        checkpoint: AgentTypes.GitCheckpointEvent,
        repoPath: string,
        taskId: string,
        runId: string,
        apiClient: PostHogAPIClient,
        localGitState?: AgentTypes.HandoffLocalGitState,
      ) => {
        const tracker = new HandoffCheckpointTracker({
          repositoryPath: repoPath,
          taskId,
          runId,
          apiClient,
        });
        await tracker.applyFromHandoff(checkpoint, {
          localGitState,
          onDivergedBranch: (divergence) =>
            this.confirmDivergedBranchReset(divergence),
        });
      },

      closeCloudRun: async (taskId, runId, apiHost, teamId, localGitState) => {
        const result = await this.cloudTaskService.sendCommand({
          taskId,
          runId,
          apiHost,
          teamId,
          method: "close",
          params: localGitState ? { localGitState } : undefined,
        });
        if (!result.success) {
          log.warn("Close command failed, continuing with handoff", {
            error: result.error,
          });
        }
      },

      updateWorkspaceMode: (taskId, mode) => {
        this.workspaceRepo.updateMode(taskId, mode);
      },

      seedLocalLogs: async (runId: string, logUrl: string) => {
        const response = await fetch(logUrl);
        if (!response.ok) {
          log.warn("Failed to fetch cloud logs for seeding", {
            status: response.status,
          });
          return;
        }
        const content = await response.text();
        if (!content?.trim()) return;

        const logDir = join(homedir(), ".posthog-code", "sessions", runId);
        mkdirSync(logDir, { recursive: true });
        writeFileSync(join(logDir, "logs.ndjson"), content);
        log.info("Seeded local logs from cloud", {
          runId,
          bytes: content.length,
        });
      },

      reconnectSession: async (params) => {
        return this.agentService.reconnectSession(params);
      },

      killSession: async (taskRunId: string) => {
        await this.agentService.cancelSession(taskRunId);
      },

      setPendingContext: (taskRunId: string, context: string) => {
        this.agentService.setPendingContext(taskRunId, context);
      },

      onProgress: (step, message) => {
        this.emit(HandoffEvent.Progress, {
          taskId: input.taskId,
          step,
          message,
        });
      },
    };

    const saga = new HandoffSaga(deps, log);
    const result = await saga.run(input);

    if (!result.success) {
      log.error("Handoff saga failed", {
        error: result.error,
        failedStep: result.failedStep,
      });
      deps.onProgress("failed", result.error ?? "Handoff failed");
      return {
        success: false,
        error: `Handoff failed at step '${result.failedStep}': ${result.error}`,
      };
    }

    return {
      success: true,
      sessionId: result.data.sessionId,
    };
  }

  private async getLocalGitState(
    repoPath: string,
  ): Promise<AgentTypes.HandoffLocalGitState> {
    return readHandoffLocalGitState(repoPath);
  }

  private async confirmDivergedBranchReset(
    divergence: GitHandoffBranchDivergence,
  ): Promise<boolean> {
    await this.appLifecycle.whenReady();

    const response = await this.dialog.confirm({
      severity: "warning",
      options: ["Cancel", "Continue"],
      defaultIndex: 0,
      cancelIndex: 0,
      title: "Local branch has diverged",
      message: `The local branch '${divergence.branch}' has commits that are not in the cloud handoff.`,
      detail:
        `Continuing will reset '${divergence.branch}' from ${divergence.localHead.slice(0, 7)} to ${divergence.cloudHead.slice(0, 7)}.\n\n` +
        "Cancel if you want to keep the current local branch tip.",
    });
    return response === CONTINUE_DIVERGENCE_BUTTON;
  }
}
