import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type GitHandoffBranchDivergence,
  type GitHandoffCheckpoint,
  GitHandoffTracker,
} from "@posthog/git/handoff";
import type { PostHogAPIClient } from "./posthog-api";
import type { GitCheckpoint, HandoffLocalGitState } from "./types";
import { Logger } from "./utils/logger";

export interface HandoffCheckpointTrackerConfig {
  repositoryPath: string;
  taskId: string;
  runId: string;
  apiClient?: PostHogAPIClient;
  logger?: Logger;
}

type ArtifactTransfer<T extends object = {}> = T & {
  rawBytes: number;
  wireBytes: number;
};

type UploadedArtifact = ArtifactTransfer<{ storagePath?: string }>;
type DownloadedArtifact = ArtifactTransfer<{ filePath: string }>;

type ArtifactKey = "pack" | "index";
type ArtifactSlotMap<T extends object> = Partial<
  Record<ArtifactKey, ArtifactTransfer<T>>
>;

interface UploadArtifactSpec {
  key: ArtifactKey;
  filePath?: string;
  name: string;
  contentType: string;
}

interface DownloadArtifactSpec {
  key: ArtifactKey;
  storagePath?: string;
  filePath: string;
  label: string;
}

type Uploads = ArtifactSlotMap<{ storagePath?: string }>;
type Downloads = ArtifactSlotMap<{ filePath: string }>;

export class HandoffCheckpointTracker {
  private repositoryPath: string;
  private taskId: string;
  private runId: string;
  private apiClient?: PostHogAPIClient;
  private logger: Logger;

  constructor(config: HandoffCheckpointTrackerConfig) {
    this.repositoryPath = config.repositoryPath;
    this.taskId = config.taskId;
    this.runId = config.runId;
    this.apiClient = config.apiClient;
    this.logger =
      config.logger ||
      new Logger({ debug: false, prefix: "[HandoffCheckpointTracker]" });
  }

  async captureForHandoff(
    localGitState?: HandoffLocalGitState,
  ): Promise<GitCheckpoint | null> {
    if (!this.apiClient) {
      throw new Error(
        "Cannot capture handoff checkpoint: API client not configured",
      );
    }

    const gitTracker = this.createGitTracker();
    const capture = await gitTracker.captureForHandoff(localGitState);

    try {
      const uploads = await this.uploadArtifacts([
        {
          key: "pack",
          filePath: capture.headPack?.path,
          name: `handoff/${capture.checkpoint.checkpointId}.pack`,
          contentType: "application/x-git-packed-objects",
        },
        {
          key: "index",
          filePath: capture.indexFile.path,
          name: `handoff/${capture.checkpoint.checkpointId}.index`,
          contentType: "application/octet-stream",
        },
      ]);

      this.logCaptureMetrics(capture.checkpoint, uploads);

      return {
        ...capture.checkpoint,
        artifactPath: uploads.pack?.storagePath,
        indexArtifactPath: uploads.index?.storagePath,
      };
    } finally {
      await this.removeIfPresent(capture.headPack?.path);
      await this.removeIfPresent(capture.indexFile.path);
    }
  }

  async applyFromHandoff(
    checkpoint: GitCheckpoint,
    options?: {
      localGitState?: HandoffLocalGitState;
      onDivergedBranch?: (
        divergence: GitHandoffBranchDivergence,
      ) => Promise<boolean>;
    },
  ): Promise<void> {
    if (!this.apiClient) {
      throw new Error(
        "Cannot apply handoff checkpoint: API client not configured",
      );
    }

    const gitTracker = this.createGitTracker();
    const tmpDir = join(this.repositoryPath, ".posthog", "tmp");
    await mkdir(tmpDir, { recursive: true });

    const packPath = join(tmpDir, `${checkpoint.checkpointId}.pack`);
    const indexPath = join(tmpDir, `${checkpoint.checkpointId}.index`);

    try {
      const downloads = await this.downloadArtifacts([
        {
          key: "pack",
          storagePath: checkpoint.artifactPath,
          filePath: packPath,
          label: "handoff pack",
        },
        {
          key: "index",
          storagePath: checkpoint.indexArtifactPath,
          filePath: indexPath,
          label: "handoff index",
        },
      ]);

      const applyResult = await gitTracker.applyFromHandoff({
        checkpoint: this.toGitCheckpoint(checkpoint),
        headPackPath: downloads.pack?.filePath,
        indexPath: downloads.index?.filePath,
        localGitState: options?.localGitState,
        onDivergedBranch: options?.onDivergedBranch,
      });

      this.logApplyMetrics(checkpoint, downloads, applyResult.totalBytes);
    } finally {
      await this.removeIfPresent(packPath);
      await this.removeIfPresent(indexPath);
    }
  }

  private toGitCheckpoint(checkpoint: GitCheckpoint): GitHandoffCheckpoint {
    return {
      checkpointId: checkpoint.checkpointId,
      commit: checkpoint.commit,
      checkpointRef: checkpoint.checkpointRef,
      headRef: checkpoint.headRef,
      head: checkpoint.head,
      branch: checkpoint.branch,
      indexTree: checkpoint.indexTree,
      worktreeTree: checkpoint.worktreeTree,
      timestamp: checkpoint.timestamp,
      upstreamRemote: checkpoint.upstreamRemote ?? null,
      upstreamMergeRef: checkpoint.upstreamMergeRef ?? null,
      remoteUrl: checkpoint.remoteUrl ?? null,
    };
  }

  private async uploadArtifactFile(
    filePath: string,
    name: string,
    contentType: string,
  ): Promise<UploadedArtifact> {
    if (!this.apiClient) {
      return { rawBytes: 0, wireBytes: 0 };
    }

    const content = await readFile(filePath);
    const base64Content = content.toString("base64");
    const artifacts = await this.apiClient.uploadTaskArtifacts(
      this.taskId,
      this.runId,
      [
        {
          name,
          type: "artifact",
          content: base64Content,
          content_type: contentType,
        },
      ],
    );

    return {
      storagePath: artifacts.at(-1)?.storage_path,
      rawBytes: content.byteLength,
      wireBytes: Buffer.byteLength(base64Content, "utf-8"),
    };
  }

  private async uploadArtifacts(specs: UploadArtifactSpec[]): Promise<Uploads> {
    const uploads = await Promise.all(
      specs.map(async (spec) => {
        if (!spec.filePath) {
          return [spec.key, undefined] as const;
        }
        return [
          spec.key,
          await this.uploadArtifactFile(
            spec.filePath,
            spec.name,
            spec.contentType,
          ),
        ] as const;
      }),
    );

    return Object.fromEntries(uploads) as Uploads;
  }

  private async downloadArtifactToFile(
    artifactPath: string,
    filePath: string,
    label: string,
  ): Promise<DownloadedArtifact> {
    if (!this.apiClient) {
      throw new Error(`Cannot download ${label}: API client not configured`);
    }

    const arrayBuffer = await this.apiClient.downloadArtifact(
      this.taskId,
      this.runId,
      artifactPath,
    );
    if (!arrayBuffer) {
      throw new Error(`Failed to download ${label}`);
    }

    const base64Content = Buffer.from(arrayBuffer).toString("utf-8");
    const binaryContent = Buffer.from(base64Content, "base64");
    await writeFile(filePath, binaryContent);
    return {
      filePath,
      rawBytes: binaryContent.byteLength,
      wireBytes: arrayBuffer.byteLength,
    };
  }

  private async downloadArtifacts(
    specs: DownloadArtifactSpec[],
  ): Promise<Downloads> {
    const downloads = await Promise.all(
      specs.map(async (spec) => {
        if (!spec.storagePath) {
          return [spec.key, undefined] as const;
        }
        return [
          spec.key,
          await this.downloadArtifactToFile(
            spec.storagePath,
            spec.filePath,
            spec.label,
          ),
        ] as const;
      }),
    );

    return Object.fromEntries(downloads) as Downloads;
  }

  private createGitTracker(): GitHandoffTracker {
    return new GitHandoffTracker({
      repositoryPath: this.repositoryPath,
      logger: this.logger,
    });
  }

  private logCaptureMetrics(
    checkpoint: GitHandoffCheckpoint,
    uploads: Uploads,
  ): void {
    this.logger.info("Captured handoff checkpoint", {
      checkpointId: checkpoint.checkpointId,
      branch: checkpoint.branch,
      head: checkpoint.head,
      artifactPath: uploads.pack?.storagePath,
      indexArtifactPath: uploads.index?.storagePath,
      ...this.buildMetricPayload(uploads),
    });
  }

  private logApplyMetrics(
    checkpoint: GitCheckpoint,
    downloads: Downloads,
    totalBytes: number,
  ): void {
    this.logger.info("Applied handoff checkpoint", {
      checkpointId: checkpoint.checkpointId,
      commit: checkpoint.commit,
      branch: checkpoint.branch,
      head: checkpoint.head,
      packBytes: downloads.pack?.rawBytes ?? 0,
      packWireBytes: downloads.pack?.wireBytes ?? 0,
      indexBytes: downloads.index?.rawBytes ?? 0,
      indexWireBytes: downloads.index?.wireBytes ?? 0,
      totalBytes,
      totalWireBytes: this.sumWireBytes(downloads.pack, downloads.index),
    });
  }

  private buildMetricPayload(metrics: ArtifactSlotMap<object>): {
    packBytes: number;
    packWireBytes: number;
    indexBytes: number;
    indexWireBytes: number;
    totalBytes: number;
    totalWireBytes: number;
  } {
    return {
      packBytes: metrics.pack?.rawBytes ?? 0,
      packWireBytes: metrics.pack?.wireBytes ?? 0,
      indexBytes: metrics.index?.rawBytes ?? 0,
      indexWireBytes: metrics.index?.wireBytes ?? 0,
      totalBytes: this.sumRawBytes(metrics.pack, metrics.index),
      totalWireBytes: this.sumWireBytes(metrics.pack, metrics.index),
    };
  }

  private sumRawBytes(
    ...artifacts: Array<{ rawBytes: number } | undefined>
  ): number {
    return artifacts.reduce(
      (total, artifact) => total + (artifact?.rawBytes ?? 0),
      0,
    );
  }

  private sumWireBytes(
    ...artifacts: Array<{ wireBytes: number } | undefined>
  ): number {
    return artifacts.reduce(
      (total, artifact) => total + (artifact?.wireBytes ?? 0),
      0,
    );
  }

  private async removeIfPresent(filePath: string | undefined): Promise<void> {
    if (!filePath) {
      return;
    }
    await rm(filePath, { force: true }).catch(() => {});
  }
}
