import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { forceRemove, parseGitHubUrl, parsePrUrl } from "./utils";

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("forceRemove", () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await forceRemove(workDir).catch(() => {});
      workDir = undefined;
    }
  });

  it("is a no-op for a missing path", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "posthog-force-remove-"));
    await expect(
      forceRemove(path.join(workDir, "missing")),
    ).resolves.toBeUndefined();
  });

  it.each([
    {
      name: "writable tree",
      setup: async (target: string) => {
        await mkdir(path.join(target, "nested"), { recursive: true });
        await writeFile(path.join(target, "nested", "file.txt"), "x");
      },
    },
    {
      name: "read-only directories (Go module cache shape)",
      setup: async (target: string) => {
        const inner = path.join(target, "yaml.v3@v3.0.1", ".github");
        await mkdir(inner, { recursive: true });
        await writeFile(path.join(inner, "workflow.yml"), "on: push\n");
        await chmod(path.join(target, "yaml.v3@v3.0.1", ".github"), 0o555);
        await chmod(path.join(target, "yaml.v3@v3.0.1"), 0o555);
        // Confirm plain fs.rm cannot remove it.
        await expect(
          rm(target, { recursive: true, force: true }),
        ).rejects.toMatchObject({ code: "EACCES" });
        // Restore read-only state so forceRemove starts clean.
        await chmod(path.join(target, "yaml.v3@v3.0.1"), 0o555);
        await chmod(path.join(target, "yaml.v3@v3.0.1", ".github"), 0o555);
      },
    },
  ])("removes a $name", async ({ setup }) => {
    workDir = await mkdtemp(path.join(tmpdir(), "posthog-force-remove-"));
    const target = path.join(workDir, "tree");
    await mkdir(target);
    await setup(target);

    await forceRemove(target);

    expect(await fileExists(target)).toBe(false);
  });
});

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/PostHog/code.git", "PostHog", "code"],
    ["https://github.com/PostHog/code", "PostHog", "code"],
    ["https://github.com/PostHog/code/", "PostHog", "code"],
    ["https://github.com/PostHog/code.git/", "PostHog", "code"],
    ["http://github.com/PostHog/code.git", "PostHog", "code"],
    ["https://user:token@github.com/PostHog/code.git", "PostHog", "code"],
    ["git@github.com:PostHog/code.git", "PostHog", "code"],
    ["git@github.com:PostHog/code", "PostHog", "code"],
    ["ssh://git@github.com/PostHog/code.git", "PostHog", "code"],
    ["ssh://git@ssh.github.com:443/PostHog/code.git", "PostHog", "code"],
    [
      "ssh://git@ssh.github.com:443/buildingapplications/bilt-landing.git",
      "buildingapplications",
      "bilt-landing",
    ],
    ["ssh://git@github.com:22/PostHog/code.git", "PostHog", "code"],
    ["git://github.com/PostHog/code.git", "PostHog", "code"],
    ["git+https://github.com/PostHog/code.git", "PostHog", "code"],
    ["git+ssh://git@github.com/PostHog/code.git", "PostHog", "code"],
    ["  https://github.com/PostHog/code.git\n", "PostHog", "code"],
    ["PostHog/code", "PostHog", "code"],
    ["https://github.com/PostHog/code/blob/main/README.md", "PostHog", "code"],
    ["https://github.com/PostHog/code/tree/main", "PostHog", "code"],
    ["https://github.com/PostHog/code/issues/12", "PostHog", "code"],
    ["https://github.com/PostHog/code/commit/abc123", "PostHog", "code"],
  ])("parses %s", (url, organization, repository) => {
    expect(parseGitHubUrl(url)).toEqual({
      organization,
      repository,
      path: `${organization}/${repository}`,
    });
  });

  it.each([
    "",
    "not-a-url",
    "https://gitlab.com/PostHog/code.git",
    "https://example.com/PostHog/code.git",
    "git@gitlab.com:PostHog/code.git",
    "https://github.com/PostHog",
    "git@my-alias:PostHog/code.git",
  ])("returns null for %s", (url) => {
    expect(parseGitHubUrl(url)).toBeNull();
  });
});

describe("parsePrUrl", () => {
  it.each([
    ["https://github.com/PostHog/code/pull/42", "PostHog", "code", 42],
    ["http://github.com/PostHog/code/pull/1", "PostHog", "code", 1],
    [
      "https://github.com/buildingapplications/bilt-landing/pull/123",
      "buildingapplications",
      "bilt-landing",
      123,
    ],
    ["  https://github.com/PostHog/code/pull/7\n", "PostHog", "code", 7],
  ])("parses %s", (url, owner, repo, number) => {
    expect(parsePrUrl(url)).toEqual({ owner, repo, number });
  });

  it.each([
    "",
    "not-a-url",
    "https://github.com/PostHog/code",
    "https://github.com/PostHog/code/issues/42",
    "https://github.com/PostHog/code/pull/abc",
    "https://github.com/PostHog/code/pull/0",
    "https://gitlab.com/PostHog/code/pull/42",
  ])("returns null for %s", (url) => {
    expect(parsePrUrl(url)).toBeNull();
  });
});
