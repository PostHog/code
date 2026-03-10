import { describe, expect, it } from "vitest";
import { isBashCommandReadOnly, isToolAllowedForMode } from "./tools.js";

describe("isBashCommandReadOnly", () => {
  it("allows known read-only programs", () => {
    const programs = [
      "ls",
      "cat /tmp/foo.txt",
      "head -n 10 file.ts",
      "tail -f log.txt",
      "wc -l file.ts",
      "tree .",
      "bat src/main.ts",
      "rg pattern src/",
      "grep -r TODO .",
      "fd '*.ts'",
      "find . -name '*.ts'",
      "stat package.json",
      "du -sh node_modules",
      "jq '.name' package.json",
      "pwd",
      "which node",
      "env",
      "uname -a",
      "sort file.txt",
      "uniq file.txt",
    ];

    for (const command of programs) {
      expect(
        isBashCommandReadOnly("Bash", { command }),
        `expected "${command}" to be read-only`,
      ).toBe(true);
    }
  });

  it("allows read-only git subcommands", () => {
    const commands = [
      "git status",
      "git log --oneline -10",
      "git diff HEAD",
      "git show HEAD:file.ts",
      "git branch -a",
      "git remote -v",
      "git tag -l",
      "git describe --tags",
      "git rev-parse HEAD",
      "git rev-list --count HEAD",
      "git shortlog -sn",
    ];

    for (const command of commands) {
      expect(
        isBashCommandReadOnly("Bash", { command }),
        `expected "${command}" to be read-only`,
      ).toBe(true);
    }
  });

  it("rejects commands with shell operators", () => {
    const commands = [
      "ls && rm -rf /",
      "cat file.txt | head",
      "ls; rm -rf /",
      "ls || echo fail",
      "cat $(whoami)",
      "cat `whoami`",
      "ls\nrm -rf /",
      "cat /etc/passwd > /tmp/exfil.txt",
      "echo malicious >> ~/.bashrc",
      "sort < file.txt",
      "ls > out.txt",
    ];

    for (const command of commands) {
      expect(
        isBashCommandReadOnly("Bash", { command }),
        `expected "${command}" to be blocked`,
      ).toBe(false);
    }
  });

  it("rejects mutating programs", () => {
    const commands = [
      "rm -rf node_modules",
      "touch new-file.ts",
      "mkdir -p src/new",
      "cp file.ts file2.ts",
      "mv old.ts new.ts",
      "npm install",
      "pnpm add lodash",
      "node script.js",
      "python -c 'print(1)'",
      "curl https://example.com",
      "sed -i 's/a/b/' file.ts",
      "awk '{print}' file.ts",
    ];

    for (const command of commands) {
      expect(
        isBashCommandReadOnly("Bash", { command }),
        `expected "${command}" to be blocked`,
      ).toBe(false);
    }
  });

  it("rejects mutating git subcommands", () => {
    const commands = [
      "git push origin main",
      "git commit -m 'msg'",
      "git checkout -b new-branch",
      "git merge feature",
      "git rebase main",
      "git reset --hard HEAD~1",
      "git stash",
      "git add .",
    ];

    for (const command of commands) {
      expect(
        isBashCommandReadOnly("Bash", { command }),
        `expected "${command}" to be blocked`,
      ).toBe(false);
    }
  });

  it("rejects non-Bash tool names", () => {
    expect(isBashCommandReadOnly("BashOutput", { command: "ls" })).toBe(false);
    expect(isBashCommandReadOnly("KillShell", { command: "ls" })).toBe(false);
    expect(isBashCommandReadOnly("Read", { command: "ls" })).toBe(false);
  });

  it("rejects empty or missing commands", () => {
    expect(isBashCommandReadOnly("Bash", { command: "" })).toBe(false);
    expect(isBashCommandReadOnly("Bash", { command: "   " })).toBe(false);
    expect(isBashCommandReadOnly("Bash", {})).toBe(false);
  });

  it("rejects git without a subcommand", () => {
    expect(isBashCommandReadOnly("Bash", { command: "git" })).toBe(false);
  });
});

describe("isToolAllowedForMode with Bash", () => {
  it("auto-allows read-only Bash commands in default mode", () => {
    expect(isToolAllowedForMode("Bash", "default", { command: "ls -la" })).toBe(
      true,
    );
  });

  it("auto-allows read-only Bash commands in plan mode", () => {
    expect(
      isToolAllowedForMode("Bash", "plan", { command: "rg pattern src/" }),
    ).toBe(true);
  });

  it("blocks mutating Bash commands in default mode", () => {
    expect(
      isToolAllowedForMode("Bash", "default", { command: "rm -rf /" }),
    ).toBe(false);
  });

  it("still auto-allows non-Bash tools without toolInput", () => {
    expect(isToolAllowedForMode("Read", "default")).toBe(true);
    expect(isToolAllowedForMode("Glob", "default")).toBe(true);
  });
});
