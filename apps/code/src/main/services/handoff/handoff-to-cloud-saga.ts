import type * as AgentTypes from "@posthog/agent/types";
import { Saga, type SagaLogger } from "@posthog/shared";
import type { HandoffBaseDeps, HandoffToCloudExecuteInput } from "./schemas";

export type HandoffToCloudSagaInput = HandoffToCloudExecuteInput;

export interface HandoffToCloudSagaOutput {
  checkpointCaptured: boolean;
  snapshotCaptured: boolean;
  flushedLogEntryCount: number;
}

export interface HandoffToCloudSagaDeps extends HandoffBaseDeps {
  captureGitCheckpoint(
    localGitState?: AgentTypes.HandoffLocalGitState,
  ): Promise<AgentTypes.GitCheckpointEvent | null>;
  captureTreeSnapshot(): Promise<AgentTypes.TreeSnapshotEvent | null>;
  persistCheckpointToLog(
    checkpoint: AgentTypes.GitCheckpointEvent,
  ): Promise<void>;
  persistSnapshotToLog(snapshot: AgentTypes.TreeSnapshotEvent): Promise<void>;
  flushLocalLogs(): Promise<number>;
  resumeRunInCloud(): Promise<void>;
}

export class HandoffToCloudSaga extends Saga<
  HandoffToCloudSagaInput,
  HandoffToCloudSagaOutput
> {
  readonly sagaName = "HandoffToCloudSaga";
  private deps: HandoffToCloudSagaDeps;

  constructor(deps: HandoffToCloudSagaDeps, logger?: SagaLogger) {
    super(logger);
    this.deps = deps;
  }

  protected async execute(
    input: HandoffToCloudSagaInput,
  ): Promise<HandoffToCloudSagaOutput> {
    const { taskId, runId } = input;

    let checkpointCaptured = false;
    let snapshotCaptured = false;

    this.deps.onProgress(
      "capturing_checkpoint",
      "Capturing local git state...",
    );

    const checkpoint = await this.readOnlyStep("capture_git_checkpoint", () =>
      this.deps.captureGitCheckpoint(input.localGitState),
    );

    let persistedNotificationCount = 0;

    if (checkpoint) {
      await this.readOnlyStep("persist_checkpoint_to_log", () =>
        this.deps.persistCheckpointToLog(checkpoint),
      );
      checkpointCaptured = true;
      persistedNotificationCount++;
    }

    this.deps.onProgress("capturing_snapshot", "Capturing local file state...");

    const snapshot = await this.readOnlyStep("capture_tree_snapshot", () =>
      this.deps.captureTreeSnapshot(),
    );

    if (snapshot) {
      await this.readOnlyStep("persist_snapshot_to_log", () =>
        this.deps.persistSnapshotToLog(snapshot),
      );
      snapshotCaptured = true;
      persistedNotificationCount++;
    }

    const localLogLineCount = await this.readOnlyStep("flush_local_logs", () =>
      this.deps.flushLocalLogs(),
    );
    const flushedLogEntryCount = localLogLineCount + persistedNotificationCount;

    this.deps.onProgress("starting_cloud_run", "Starting cloud sandbox...");

    await this.step({
      name: "start_cloud_run",
      execute: () => this.deps.resumeRunInCloud(),
      rollback: async () => {},
    });

    this.deps.onProgress("stopping_agent", "Stopping local agent...");

    await this.readOnlyStep("stop_local_agent", () =>
      this.deps.killSession(runId),
    );

    await this.step({
      name: "update_workspace",
      execute: async () => {
        this.deps.updateWorkspaceMode(taskId, "cloud");
      },
      rollback: async () => {
        this.deps.updateWorkspaceMode(taskId, "local");
      },
    });

    this.deps.onProgress("complete", "Handoff to cloud complete");

    return { checkpointCaptured, snapshotCaptured, flushedLogEntryCount };
  }
}
