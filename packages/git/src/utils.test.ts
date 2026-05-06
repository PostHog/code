import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { forceRemove, parseGitHubUrl } from "./utils";

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
    ["https://github.com/posthog/posthog.git", "posthog", "posthog"],
    ["https://github.com/posthog/posthog", "posthog", "posthog"],
    ["http://github.com/posthog/posthog.git", "posthog", "posthog"],
    ["https://user:token@github.com/posthog/posthog.git", "posthog", "posthog"],
    ["git@github.com:posthog/posthog.git", "posthog", "posthog"],
    ["git@github.com:posthog/posthog", "posthog", "posthog"],
    ["ssh://git@github.com/posthog/posthog.git", "posthog", "posthog"],
    ["ssh://git@ssh.github.com:443/posthog/posthog.git", "posthog", "posthog"],
    ["ssh://git@github.com:22/posthog/posthog.git", "posthog", "posthog"],
    ["git://github.com/posthog/posthog.git", "posthog", "posthog"],
    ["  https://github.com/posthog/posthog.git\n", "posthog", "posthog"],
  ])("parses %s", (url, organization, repository) => {
    expect(parseGitHubUrl(url)).toEqual({ organization, repository });
  });

  it.each([
    "",
    "not-a-url",
    "https://gitlab.com/posthog/posthog.git",
    "https://example.com/posthog/posthog.git",
    "git@gitlab.com:posthog/posthog.git",
    "https://github.com/posthog",
    "https://github.com/posthog/posthog/extra",
    "git@my-alias:posthog/posthog.git",
  ])("returns null for %s", (url) => {
    expect(parseGitHubUrl(url)).toBeNull();
  });
});
