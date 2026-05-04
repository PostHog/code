import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { forceRemove } from "./utils";

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
      // Restore writability so cleanup never fails the run.
      await chmod(workDir, 0o700).catch(() => {});
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      workDir = undefined;
    }
  });

  it("removes a writable tree", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "posthog-force-remove-"));
    const target = path.join(workDir, "tree");
    await mkdir(path.join(target, "nested"), { recursive: true });
    await writeFile(path.join(target, "nested", "file.txt"), "x");

    await forceRemove(target);

    expect(await fileExists(target)).toBe(false);
  });

  it("is a no-op for a missing path", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "posthog-force-remove-"));
    await expect(
      forceRemove(path.join(workDir, "missing")),
    ).resolves.toBeUndefined();
  });

  it("removes a tree with read-only directories (Go module cache shape)", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "posthog-force-remove-"));
    const target = path.join(workDir, "tree");
    const inner = path.join(target, "yaml.v3@v3.0.1", ".github");
    await mkdir(inner, { recursive: true });
    await writeFile(path.join(inner, "workflow.yml"), "on: push\n");

    // Mimic Go's modcache lockdown: every directory inside loses its write bit.
    await chmod(path.join(target, "yaml.v3@v3.0.1", ".github"), 0o555);
    await chmod(path.join(target, "yaml.v3@v3.0.1"), 0o555);

    await expect(
      rm(target, { recursive: true, force: true }),
    ).rejects.toMatchObject({ code: "EACCES" });
    // Restore the dir so forceRemove starts from the same state every run.
    await chmod(path.join(target, "yaml.v3@v3.0.1"), 0o555);
    await chmod(path.join(target, "yaml.v3@v3.0.1", ".github"), 0o555);

    await forceRemove(target);

    expect(await fileExists(target)).toBe(false);
  });
});
