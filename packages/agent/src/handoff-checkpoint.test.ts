import { afterEach, describe, expect, it } from "vitest";
import { HandoffCheckpointTracker } from "./handoff-checkpoint";
import {
  cloneTestRepo,
  createTestRepo,
  type TestRepo,
} from "./sagas/test-fixtures";
import type { HandoffLocalGitState } from "./types";

interface BundleStore {
  artifacts: Record<string, string>;
  storagePath: string;
  manifest: Array<{ storage_path: string }>;
}

interface HandoffRepos {
  cloudRepo: TestRepo;
  localRepo: TestRepo;
  branch: string;
  localGitState: HandoffLocalGitState;
}

function createMockApi(store: BundleStore) {
  return {
    uploadTaskArtifacts: async (
      _taskId: string,
      _runId: string,
      artifacts: Array<{
        name: string;
        content: string;
      }>,
    ) => {
      const uploaded = artifacts.map((artifact, index) => {
        const storagePath = `${store.storagePath}-${store.manifest.length + index}-${artifact.name}`;
        store.artifacts[storagePath] = artifact.content;
        return { storage_path: storagePath };
      });
      for (const entry of uploaded) {
        store.manifest.push(entry);
      }
      return store.manifest;
    },
    downloadArtifact: async (
      _taskId: string,
      _runId: string,
      artifactPath: string,
    ) => {
      const contentBase64 = store.artifacts[artifactPath];
      if (!contentBase64) return null;
      const buffer = Buffer.from(contentBase64, "utf-8");
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
    },
  };
}

function createBundleStore(): BundleStore {
  return {
    storagePath: "gs://bucket/handoff",
    artifacts: {},
    manifest: [
      {
        storage_path: "gs://bucket/handoff-0-existing-checkpoint.pack",
      },
    ],
  };
}

function createTracker(
  repositoryPath: string,
  apiClient: ReturnType<typeof createMockApi>,
) {
  return new HandoffCheckpointTracker({
    repositoryPath,
    taskId: "task-1",
    runId: "run-1",
    apiClient: apiClient as never,
  });
}

async function seedCloudRepo(repo: TestRepo): Promise<void> {
  await repo.writeFile("tracked.txt", "base\n");
  await repo.writeFile("unstaged.txt", "base unstaged\n");
  await repo.git(["add", "tracked.txt", "unstaged.txt"]);
  await repo.git(["commit", "-m", "Add tracked files"]);
}

async function prepareHandoffRepos(
  cleanups: Array<() => Promise<void>>,
): Promise<HandoffRepos> {
  const cloudRepo = await createTestRepo("handoff-cloud");
  cleanups.push(cloudRepo.cleanup);
  await seedCloudRepo(cloudRepo);

  const localRepo = await cloneTestRepo(cloudRepo.path, "handoff-local");
  cleanups.push(localRepo.cleanup);

  const branch = await cloudRepo.git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const localHead = await localRepo.git(["rev-parse", "HEAD"]);
  const upstreamHead = await localRepo.git(["rev-parse", `origin/${branch}`]);

  return {
    cloudRepo,
    localRepo,
    branch,
    localGitState: {
      head: localHead,
      branch,
      upstreamHead,
      upstreamRemote: "origin",
      upstreamMergeRef: `refs/heads/${branch}`,
    },
  };
}

async function makeCloudChanges(repo: TestRepo): Promise<void> {
  await repo.writeFile("committed.txt", "cloud commit\n");
  await repo.git(["add", "committed.txt"]);
  await repo.git(["commit", "-m", "Cloud commit"]);

  await repo.writeFile("tracked.txt", "staged change\n");
  await repo.git(["add", "tracked.txt"]);
  await repo.writeFile("unstaged.txt", "unstaged change\n");
  await repo.writeFile("untracked.txt", "untracked\n");
}

describe("HandoffCheckpointTracker", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("restores head, worktree, and index state for handoff replay", async () => {
    const { cloudRepo, localRepo, branch, localGitState } =
      await prepareHandoffRepos(cleanups);
    await makeCloudChanges(cloudRepo);

    const store = createBundleStore();
    const apiClient = createMockApi(store);
    const captureTracker = createTracker(cloudRepo.path, apiClient);

    const checkpoint = await captureTracker.captureForHandoff(localGitState);

    expect(checkpoint).not.toBeNull();
    if (!checkpoint) return;
    expect(Object.keys(store.artifacts).length).toBeGreaterThan(0);

    const applyTracker = createTracker(localRepo.path, apiClient);
    await applyTracker.applyFromHandoff(checkpoint);

    expect(await localRepo.git(["rev-parse", "HEAD"])).toBe(checkpoint.head);
    expect(await localRepo.git(["rev-parse", "--abbrev-ref", "HEAD"])).toBe(
      branch,
    );
    expect(await localRepo.readFile("committed.txt")).toBe("cloud commit\n");
    expect(await localRepo.readFile("tracked.txt")).toBe("staged change\n");
    expect(await localRepo.readFile("unstaged.txt")).toBe("unstaged change\n");
    expect(await localRepo.readFile("untracked.txt")).toBe("untracked\n");

    const status = await localRepo.git(["status", "--porcelain"]);
    expect(status).toContain("M  tracked.txt");
    expect(status).toContain(" M unstaged.txt");
    expect(status).toContain("?? untracked.txt");
    expect(localRepo.exists(".posthog/tmp")).toBe(false);
  });
});
