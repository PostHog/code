import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";

// Isolate git's global config for the duration of the test suite. Several
// tests shell out to `git` (creating repos, committing, configuring
// credential helpers) and we don't want to inherit the developer's host
// settings — most importantly `commit.gpgsign`, which fails commits when no
// gpg agent is reachable.
let isolatedDir: string | null = null;
const savedGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;

beforeAll(() => {
  isolatedDir = mkdtempSync(join(tmpdir(), "agent-test-gitconfig-"));
  const configPath = join(isolatedDir, "gitconfig");
  writeFileSync(
    configPath,
    "[commit]\n  gpgsign = false\n[tag]\n  gpgsign = false\n",
  );
  process.env.GIT_CONFIG_GLOBAL = configPath;
});

afterAll(() => {
  if (savedGitConfigGlobal === undefined) {
    delete process.env.GIT_CONFIG_GLOBAL;
  } else {
    process.env.GIT_CONFIG_GLOBAL = savedGitConfigGlobal;
  }
  if (isolatedDir) {
    rmSync(isolatedDir, { recursive: true, force: true });
    isolatedDir = null;
  }
});
