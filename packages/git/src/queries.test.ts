import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGitClient } from "./client";
import {
  detectDefaultBranch,
  getAllBranches,
  getBranchDiffPatchesByPath,
  getGitBusyState,
  splitUnifiedDiffByFile,
} from "./queries";

async function setupRepo(defaultBranch = "main"): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "posthog-code-queries-"));
  const git = createGitClient(dir);
  await git.init(["--initial-branch", defaultBranch]);
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(path.join(dir, "file.txt"), "content\n");
  await git.add(["file.txt"]);
  await git.commit("initial");
  return dir;
}

describe("detectDefaultBranch", () => {
  let repoDir: string;

  afterEach(async () => {
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it("detects 'main' as default branch", async () => {
    repoDir = await setupRepo("main");
    const git = createGitClient(repoDir);
    const result = await detectDefaultBranch(git);
    expect(result).toBe("main");
  });

  it("detects 'master' as default branch", async () => {
    repoDir = await setupRepo("master");
    const git = createGitClient(repoDir);
    const result = await detectDefaultBranch(git);
    expect(result).toBe("master");
  });

  it("detects non-standard default branch via init.defaultBranch config", async () => {
    repoDir = await setupRepo("develop");
    const git = createGitClient(repoDir);

    // Set init.defaultBranch in the repo's local config
    await git.addConfig("init.defaultBranch", "develop");

    const result = await detectDefaultBranch(git);
    expect(result).toBe("develop");
  });

  it("falls back to current branch when no standard branch exists", async () => {
    repoDir = await setupRepo("trunk");
    const git = createGitClient(repoDir);
    const result = await detectDefaultBranch(git);
    expect(result).toBe("trunk");
  });

  it("prefers 'main' over other detection methods", async () => {
    repoDir = await setupRepo("main");
    const git = createGitClient(repoDir);

    // Create additional branches
    await git.checkoutLocalBranch("develop");
    await git.checkout("main");

    const result = await detectDefaultBranch(git);
    expect(result).toBe("main");
  });

  it("prefers remote HEAD over local detection", async () => {
    repoDir = await setupRepo("main");
    const git = createGitClient(repoDir);

    // Set up a bare remote with a non-standard default branch
    const remoteDir = await mkdtemp(
      path.join(tmpdir(), "posthog-code-remote-"),
    );
    const remoteGit = createGitClient(remoteDir);
    await remoteGit.init(["--bare", "--initial-branch", "production"]);
    await git.addRemote("origin", remoteDir);

    // Push main as production on remote and set HEAD
    await git.push(["origin", "main:production"]);
    await remoteGit.raw(["symbolic-ref", "HEAD", "refs/heads/production"]);
    await git.fetch(["origin"]);

    const result = await detectDefaultBranch(git);
    expect(result).toBe("production");

    await rm(remoteDir, { recursive: true, force: true });
  });
});

describe("splitUnifiedDiffByFile", () => {
  it("returns an empty map for empty input", () => {
    expect(splitUnifiedDiffByFile("")).toEqual(new Map());
  });

  it("splits a two-file diff keyed by post-image path", () => {
    const raw = [
      "diff --git a/one.txt b/one.txt",
      "index 0000000..1111111 100644",
      "--- a/one.txt",
      "+++ b/one.txt",
      "@@ -1 +1 @@",
      "-hello",
      "+hello world",
      "diff --git a/two.txt b/two.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/two.txt",
      "@@ -0,0 +1 @@",
      "+brand new",
      "",
    ].join("\n");

    const result = splitUnifiedDiffByFile(raw);

    expect([...result.keys()]).toEqual(["one.txt", "two.txt"]);
    expect(result.get("one.txt")).toContain("diff --git a/one.txt b/one.txt");
    expect(result.get("one.txt")).toContain("+hello world");
    expect(result.get("two.txt")).toContain("diff --git a/two.txt b/two.txt");
    expect(result.get("two.txt")).toContain("+brand new");
  });

  it("keys renames by the post-rename (b/) path", () => {
    const raw = [
      "diff --git a/old.txt b/new.txt",
      "similarity index 100%",
      "rename from old.txt",
      "rename to new.txt",
      "",
    ].join("\n");

    const result = splitUnifiedDiffByFile(raw);
    expect(result.has("new.txt")).toBe(true);
    expect(result.has("old.txt")).toBe(false);
    expect(result.get("new.txt")).toContain("rename from old.txt");
  });

  it("handles binary diffs", () => {
    const raw = [
      "diff --git a/image.png b/image.png",
      "Binary files a/image.png and b/image.png differ",
      "",
    ].join("\n");

    const result = splitUnifiedDiffByFile(raw);
    expect(result.get("image.png")).toContain("Binary files");
  });
});

describe("getBranchDiffPatchesByPath", () => {
  let repoDir: string | undefined;

  afterEach(async () => {
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
      repoDir = undefined;
    }
  });

  async function setupBranchWithCommits(): Promise<{
    repoDir: string;
    remoteDir: string;
  }> {
    const workDir = await mkdtemp(path.join(tmpdir(), "posthog-code-branch-"));
    const remoteDir = await mkdtemp(path.join(tmpdir(), "posthog-code-bare-"));

    const remoteGit = createGitClient(remoteDir);
    await remoteGit.init(["--bare", "--initial-branch", "main"]);

    const git = createGitClient(workDir);
    await git.init(["--initial-branch", "main"]);
    await git.addConfig("user.name", "Test");
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("commit.gpgsign", "false");
    await git.addRemote("origin", remoteDir);

    await writeFile(path.join(workDir, "file.txt"), "line1\nline2\n");
    await git.add(["file.txt"]);
    await git.commit("initial");
    await git.push(["origin", "main"]);

    await git.checkoutLocalBranch("feature");
    await writeFile(path.join(workDir, "file.txt"), "line1\nchanged\n");
    await writeFile(path.join(workDir, "added.txt"), "new file\n");
    await git.add(["file.txt", "added.txt"]);
    await git.commit("feature work, not pushed");

    return { repoDir: workDir, remoteDir };
  }

  it("returns per-file patches for commits not yet pushed", async () => {
    const { repoDir: workDir, remoteDir } = await setupBranchWithCommits();
    repoDir = workDir;

    try {
      const patches = await getBranchDiffPatchesByPath(
        workDir,
        "main",
        "feature",
      );

      expect(patches.has("file.txt")).toBe(true);
      expect(patches.has("added.txt")).toBe(true);
      expect(patches.get("file.txt")).toContain("-line2");
      expect(patches.get("file.txt")).toContain("+changed");
      expect(patches.get("added.txt")).toContain("+new file");
    } finally {
      await rm(remoteDir, { recursive: true, force: true });
    }
  });

  it("returns deletions keyed by their path", async () => {
    const { repoDir: workDir, remoteDir } = await setupBranchWithCommits();
    repoDir = workDir;

    try {
      const git = createGitClient(workDir);
      await unlink(path.join(workDir, "file.txt"));
      await git.add(["file.txt"]);
      await git.commit("delete file.txt");

      const patches = await getBranchDiffPatchesByPath(
        workDir,
        "main",
        "feature",
      );

      expect(patches.get("file.txt")).toContain("deleted file mode");
    } finally {
      await rm(remoteDir, { recursive: true, force: true });
    }
  });
});

describe("getAllBranches", () => {
  let repoDir: string | undefined;

  afterEach(async () => {
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
      repoDir = undefined;
    }
  });

  async function setupRebaseConflict(dir: string): Promise<void> {
    const git = createGitClient(dir);
    // Branch from the initial commit, edit file on feature
    await git.checkoutLocalBranch("feature");
    await writeFile(path.join(dir, "file.txt"), "feature change\n");
    await git.add(["file.txt"]);
    await git.commit("on feature");
    // Diverge main with a conflicting edit
    await git.checkout("main");
    await writeFile(path.join(dir, "file.txt"), "main change\n");
    await git.add(["file.txt"]);
    await git.commit("on main");
    await git.checkout("feature");
    // Force `--no-ff` rebase so it doesn't fast-forward; expect a conflict.
    try {
      await git.rebase(["main"]);
    } catch {
      // expected: rebase pauses on conflict, leaving HEAD on a pseudo-branch
    }
  }

  it("returns only real branches, not the rebase pseudo-branch", async () => {
    repoDir = await setupRepo("main");
    await setupRebaseConflict(repoDir);

    const branches = await getAllBranches(repoDir);
    expect(branches).toEqual(expect.arrayContaining(["main", "feature"]));
    expect(branches).not.toContain("(no");
    expect(branches.every((b) => !b.startsWith("("))).toBe(true);
  });
});

describe("getGitBusyState", () => {
  let repoDir: string | undefined;

  afterEach(async () => {
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
      repoDir = undefined;
    }
  });

  it("reports busy=false in a clean repo", async () => {
    repoDir = await setupRepo("main");
    expect(await getGitBusyState(repoDir)).toEqual({ busy: false });
  });

  it("detects an in-progress rebase", async () => {
    repoDir = await setupRepo("main");
    const git = createGitClient(repoDir);

    await git.checkoutLocalBranch("feature");
    await writeFile(path.join(repoDir, "file.txt"), "feature change\n");
    await git.add(["file.txt"]);
    await git.commit("on feature");

    await git.checkout("main");
    await writeFile(path.join(repoDir, "file.txt"), "main change\n");
    await git.add(["file.txt"]);
    await git.commit("on main");

    await git.checkout("feature");
    try {
      await git.rebase(["main"]);
    } catch {
      // expected: conflict
    }

    expect(await getGitBusyState(repoDir)).toEqual({
      busy: true,
      operation: "rebase",
    });
  });
});
