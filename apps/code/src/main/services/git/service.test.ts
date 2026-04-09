import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecGh = vi.hoisted(() => vi.fn());

vi.mock("@posthog/git/gh", () => ({
  execGh: mockExecGh,
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import type { LlmGatewayService } from "../llm-gateway/service";
import { GitService } from "./service";

describe("GitService.getPrChangedFiles", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService({} as LlmGatewayService);
  });

  it("flattens paginated GH API results and maps file statuses", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([
        [
          {
            filename: "src/new.ts",
            status: "added",
            additions: 10,
            deletions: 0,
          },
          {
            filename: "src/old.ts",
            status: "removed",
            additions: 0,
            deletions: 3,
          },
        ],
        [
          {
            filename: "src/renamed-new.ts",
            status: "renamed",
            previous_filename: "src/renamed-old.ts",
            additions: 1,
            deletions: 1,
          },
          {
            filename: "src/changed.ts",
            status: "changed",
            additions: 4,
            deletions: 2,
          },
        ],
      ]),
    });

    const result = await service.getPrChangedFiles(
      "https://github.com/posthog/code/pull/123",
    );

    expect(mockExecGh).toHaveBeenCalledWith([
      "api",
      "repos/posthog/code/pulls/123/files",
      "--paginate",
      "--slurp",
    ]);

    expect(result).toEqual([
      {
        path: "src/new.ts",
        status: "added",
        originalPath: undefined,
        linesAdded: 10,
        linesRemoved: 0,
      },
      {
        path: "src/old.ts",
        status: "deleted",
        originalPath: undefined,
        linesAdded: 0,
        linesRemoved: 3,
      },
      {
        path: "src/renamed-new.ts",
        status: "renamed",
        originalPath: "src/renamed-old.ts",
        linesAdded: 1,
        linesRemoved: 1,
      },
      {
        path: "src/changed.ts",
        status: "modified",
        originalPath: undefined,
        linesAdded: 4,
        linesRemoved: 2,
      },
    ]);
  });

  it("returns empty array for non-GitHub PR URL", async () => {
    const result = await service.getPrChangedFiles(
      "https://example.com/pull/1",
    );
    expect(result).toEqual([]);
    expect(mockExecGh).not.toHaveBeenCalled();
  });

  it("throws when gh command fails", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "auth required",
    });

    await expect(
      service.getPrChangedFiles("https://github.com/posthog/code/pull/123"),
    ).rejects.toThrow("Failed to fetch PR files");
  });
});

describe("GitService.getGhAuthToken", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService({} as LlmGatewayService);
  });

  it("returns the authenticated GitHub CLI token", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 0,
      stdout: "ghu_test_token\n",
      stderr: "",
    });

    const result = await service.getGhAuthToken();

    expect(mockExecGh).toHaveBeenCalledWith(["auth", "token"]);
    expect(result).toEqual({
      success: true,
      token: "ghu_test_token",
      error: null,
    });
  });

  it("returns the gh error when auth token lookup fails", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "authentication required",
    });

    const result = await service.getGhAuthToken();

    expect(result).toEqual({
      success: false,
      token: null,
      error: "authentication required",
    });
  });

  it("returns error when stdout is empty", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const result = await service.getGhAuthToken();

    expect(result).toEqual({
      success: false,
      token: null,
      error: "GitHub auth token is empty",
    });
  });
});
