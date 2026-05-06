import { describe, expect, it } from "vitest";
import {
  buildDeepLinkUrl,
  parseArgs,
  pickOpener,
} from "./posthog-code.mjs";

describe("parseArgs", () => {
  it("treats positional args as the prompt", () => {
    expect(parseArgs(["fix", "the", "bug"]).prompt).toBe("fix the bug");
  });

  it("parses --repo", () => {
    const args = parseArgs(["--repo", "/path/to/repo", "do thing"]);
    expect(args.repo).toBe("/path/to/repo");
    expect(args.prompt).toBe("do thing");
  });

  it("parses --workspace, --model, --effort, --adapter, --branch", () => {
    const args = parseArgs([
      "--workspace",
      "worktree",
      "--model",
      "claude-opus-4-7",
      "--effort",
      "high",
      "--adapter",
      "claude",
      "--branch",
      "main",
      "do thing",
    ]);
    expect(args).toMatchObject({
      workspace: "worktree",
      model: "claude-opus-4-7",
      effort: "high",
      adapter: "claude",
      branch: "main",
      prompt: "do thing",
    });
  });

  it("parses --auto and --yes as auto=true", () => {
    expect(parseArgs(["--auto", "x"]).auto).toBe(true);
    expect(parseArgs(["--yes", "x"]).auto).toBe(true);
  });

  it("parses --dev", () => {
    expect(parseArgs(["--dev", "x"]).dev).toBe(true);
  });

  it("parses --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("parses --version and -v", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--what", "x"])).toThrow(/Unknown option/);
  });

  it("rejects invalid --workspace", () => {
    expect(() => parseArgs(["--workspace", "junk", "x"])).toThrow(
      /Invalid --workspace/,
    );
  });

  it("rejects invalid --effort", () => {
    expect(() => parseArgs(["--effort", "junk", "x"])).toThrow(
      /Invalid --effort/,
    );
  });

  it("rejects invalid --adapter", () => {
    expect(() => parseArgs(["--adapter", "junk", "x"])).toThrow(
      /Invalid --adapter/,
    );
  });

  it("rejects flag-with-missing-value", () => {
    expect(() => parseArgs(["--model"])).toThrow(/Missing value/);
    expect(() => parseArgs(["--model", "--auto"])).toThrow(/Missing value/);
  });
});

describe("buildDeepLinkUrl", () => {
  it("encodes the prompt and repo", () => {
    const url = buildDeepLinkUrl("posthog-code", {
      prompt: "fix the bug",
      repo: "/path/to/repo",
    });
    expect(url).toBe(
      "posthog-code://new?prompt=fix+the+bug&repo=%2Fpath%2Fto%2Frepo",
    );
  });

  it("includes all optional fields when provided", () => {
    const url = buildDeepLinkUrl("posthog-code", {
      prompt: "do",
      repo: "/r",
      workspace: "worktree",
      model: "m",
      effort: "high",
      adapter: "claude",
      branch: "main",
      auto: true,
    });
    const params = new URL(url).searchParams;
    expect(params.get("prompt")).toBe("do");
    expect(params.get("repo")).toBe("/r");
    expect(params.get("mode")).toBe("worktree");
    expect(params.get("model")).toBe("m");
    expect(params.get("effort")).toBe("high");
    expect(params.get("adapter")).toBe("claude");
    expect(params.get("branch")).toBe("main");
    expect(params.get("auto")).toBe("1");
  });

  it("omits optional fields when not provided", () => {
    const url = buildDeepLinkUrl("posthog-code", { prompt: "x" });
    const params = new URL(url).searchParams;
    expect(params.get("prompt")).toBe("x");
    expect(params.has("repo")).toBe(false);
    expect(params.has("auto")).toBe(false);
    expect(params.has("model")).toBe(false);
  });

  it("uses the dev scheme when requested", () => {
    const url = buildDeepLinkUrl("posthog-code-dev", { prompt: "x" });
    expect(url.startsWith("posthog-code-dev://new?")).toBe(true);
  });

  it("rejects empty prompts", () => {
    expect(() => buildDeepLinkUrl("posthog-code", { prompt: "" })).toThrow(
      /prompt is required/,
    );
    expect(() =>
      buildDeepLinkUrl("posthog-code", { prompt: "   " }),
    ).toThrow(/prompt is required/);
  });
});

describe("pickOpener", () => {
  it("returns 'open' on darwin", () => {
    expect(pickOpener("darwin")).toEqual({ command: "open", args: [] });
  });

  it("returns 'cmd /c start' on win32", () => {
    expect(pickOpener("win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", ""],
    });
  });

  it("falls back to xdg-open on linux", () => {
    expect(pickOpener("linux")).toEqual({ command: "xdg-open", args: [] });
  });
});
