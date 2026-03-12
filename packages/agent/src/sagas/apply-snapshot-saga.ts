import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApplyTreeSaga as GitApplyTreeSaga } from "@posthog/git/sagas/tree";
import { Saga } from "@posthog/shared";
import type { PostHogAPIClient } from "../posthog-api";
import type { TreeSnapshot } from "../types";

export interface ApplySnapshotInput {
  snapshot: TreeSnapshot;
  repositoryPath: string;
  apiClient: PostHogAPIClient;
  taskId: string;
  runId: string;
}

export interface ApplySnapshotOutput {
  treeHash: string;
}

export class ApplySnapshotSaga extends Saga<
  ApplySnapshotInput,
  ApplySnapshotOutput
> {
  readonly sagaName = "ApplySnapshotSaga";

  private archivePath: string | null = null;

  protected async execute(
    input: ApplySnapshotInput,
  ): Promise<ApplySnapshotOutput> {
    const { snapshot, repositoryPath, apiClient, taskId, runId } = input;
    const tmpDir = join(repositoryPath, ".posthog", "tmp");

    if (!snapshot.archiveUrl) {
      throw new Error("Cannot apply snapshot: no archive URL");
    }

    const archiveUrl = snapshot.archiveUrl;

    await this.step({
      name: "create_tmp_dir",
      execute: () => mkdir(tmpDir, { recursive: true }),
      rollback: async () => {},
    });

    const archivePath = join(tmpDir, `${snapshot.treeHash}.tar.gz`);
    this.archivePath = archivePath;
    await this.step({
      name: "download_archive",
      execute: async () => {
        const arrayBuffer = await apiClient.downloadArtifact(
          taskId,
          runId,
          archiveUrl,
        );
        if (!arrayBuffer) {
          throw new Error("Failed to download archive");
        }
        const base64Content = Buffer.from(arrayBuffer).toString("utf-8");
        const binaryContent = Buffer.from(base64Content, "base64");
        await writeFile(archivePath, binaryContent);
      },
      rollback: async () => {
        if (this.archivePath) {
          await rm(this.archivePath, { force: true }).catch(() => {});
        }
      },
    });

    const gitApplySaga = new GitApplyTreeSaga(this.log);
    const applyResult = await gitApplySaga.run({
      baseDir: repositoryPath,
      treeHash: snapshot.treeHash,
      baseCommit: snapshot.baseCommit,
      changes: snapshot.changes,
      archivePath: this.archivePath,
    });

    if (!applyResult.success) {
      throw new Error(`Failed to apply tree: ${applyResult.error}`);
    }

    await rm(this.archivePath, { force: true }).catch(() => {});

    this.log.info("Tree snapshot applied", {
      treeHash: snapshot.treeHash,
      totalChanges: snapshot.changes.length,
      deletedFiles: snapshot.changes.filter((c) => c.status === "D").length,
    });

    return { treeHash: snapshot.treeHash };
  }
}
