import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGitClient } from "./client";
import { detectDefaultBranch } from "./queries";

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
