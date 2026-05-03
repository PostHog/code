import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskData } from "./useSidebarData";
import { mapPrState, useTaskPrStatus } from "./useTaskPrStatus";

// --- useQuery mock wiring ---

const queryResults = vi.hoisted(
  () => new Map<string, { data: unknown; enabled?: boolean }>(),
);

vi.mock("@renderer/trpc/client", () => ({
  useTRPC: () => ({
    git: {
      getPrDetailsByUrl: {
        queryOptions: (
          input: { prUrl: string },
          opts: { enabled: boolean },
        ) => {
          const key = `getPrDetailsByUrl:${input.prUrl}`;
          queryResults.set(key, {
            data: queryResults.get(key)?.data,
            enabled: opts.enabled,
          });
          return { queryKey: [key], queryFn: () => undefined, ...opts };
        },
      },
      getPrUrlForBranch: {
        queryOptions: (
          input: { directoryPath: string; branchName: string },
          opts: { enabled: boolean },
        ) => {
          const key = `getPrUrlForBranch:${input.branchName}`;
          queryResults.set(key, {
            data: queryResults.get(key)?.data,
            enabled: opts.enabled,
          });
          return { queryKey: [key], queryFn: () => undefined, ...opts };
        },
      },
      getPrStatus: {
        queryOptions: (
          input: { directoryPath: string },
          opts: { enabled: boolean },
        ) => {
          const key = `getPrStatus:${input.directoryPath}`;
          queryResults.set(key, {
            data: queryResults.get(key)?.data,
            enabled: opts.enabled,
          });
          return { queryKey: [key], queryFn: () => undefined, ...opts };
        },
      },
      getDiffStats: {
        queryOptions: (
          input: { directoryPath: string },
          opts: { enabled: boolean },
        ) => {
          const key = `getDiffStats:${input.directoryPath}`;
          queryResults.set(key, {
            data: queryResults.get(key)?.data,
            enabled: opts.enabled,
          });
          return { queryKey: [key], queryFn: () => undefined, ...opts };
        },
      },
      getGitSyncStatus: {
        queryOptions: (
          input: { directoryPath: string },
          opts: { enabled: boolean },
        ) => {
          const key = `getGitSyncStatus:${input.directoryPath}`;
          queryResults.set(key, {
            data: queryResults.get(key)?.data,
            enabled: opts.enabled,
          });
          return { queryKey: [key], queryFn: () => undefined, ...opts };
        },
      },
    },
  }),
}));

let mockQueryReturn: { data: unknown } = { data: undefined };

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mockQueryReturn,
}));

// --- Helpers ---

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: "task-1",
    title: "Test task",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    isGenerating: false,
    isUnread: false,
    isPinned: false,
    needsPermission: false,
    repository: null,
    isSuspended: false,
    taskRunEnvironment: "local" as const,
    folderPath: "/repo",
    cloudPrUrl: null,
    branchName: "feat/test",
    linkedBranch: null,
    ...overrides,
  };
}

// --- Tests ---

describe("mapPrState", () => {
  it("returns merged when merged is true regardless of state", () => {
    expect(mapPrState("open", true, false)).toBe("merged");
    expect(mapPrState("OPEN", true, false)).toBe("merged");
    expect(mapPrState("closed", true, false)).toBe("merged");
    expect(mapPrState(null, true, false)).toBe("merged");
  });

  it("returns closed for closed state (case-insensitive)", () => {
    expect(mapPrState("closed", false, false)).toBe("closed");
    expect(mapPrState("CLOSED", false, false)).toBe("closed");
    expect(mapPrState("Closed", false, false)).toBe("closed");
  });

  it("returns draft when draft is true and not merged/closed", () => {
    expect(mapPrState("open", false, true)).toBe("draft");
    expect(mapPrState("OPEN", false, true)).toBe("draft");
  });

  it("returns open for open state (case-insensitive)", () => {
    expect(mapPrState("open", false, false)).toBe("open");
    expect(mapPrState("OPEN", false, false)).toBe("open");
    expect(mapPrState("Open", false, false)).toBe("open");
  });

  it("returns null for unknown state", () => {
    expect(mapPrState(null, false, false)).toBeNull();
    expect(mapPrState("something", false, false)).toBeNull();
  });

  it("merged takes priority over closed", () => {
    expect(mapPrState("closed", true, false)).toBe("merged");
  });

  it("closed takes priority over draft", () => {
    expect(mapPrState("closed", false, true)).toBe("closed");
  });
});

describe("useTaskPrStatus", () => {
  beforeEach(() => {
    queryResults.clear();
    mockQueryReturn = { data: undefined };
  });

  it("returns empty status when no data is available", () => {
    const task = makeTask();
    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));

    expect(result.current).toEqual({ prState: null, hasDiff: false });
  });

  it("returns empty status when worktreePath is null", () => {
    const task = makeTask();
    const { result } = renderHook(() => useTaskPrStatus(task, null));

    expect(result.current).toEqual({ prState: null, hasDiff: false });
  });

  it("returns empty for cloud task with no PR URL", () => {
    const task = makeTask({
      taskRunEnvironment: "cloud",
      cloudPrUrl: null,
    });
    const { result } = renderHook(() => useTaskPrStatus(task, null));

    expect(result.current).toEqual({ prState: null, hasDiff: false });
  });
});

describe("useTaskPrStatus query enablement", () => {
  beforeEach(() => {
    queryResults.clear();
    mockQueryReturn = { data: undefined };
  });

  it("enables cloud PR details query only for cloud tasks with a PR URL", () => {
    const enabledCases = [
      {
        task: makeTask({
          taskRunEnvironment: "cloud",
          cloudPrUrl: "https://github.com/org/repo/pull/1",
        }),
        path: null as string | null,
      },
    ];

    const disabledCases = [
      { task: makeTask({ taskRunEnvironment: "local" }), path: "/worktree" },
      {
        task: makeTask({ taskRunEnvironment: "cloud", cloudPrUrl: null }),
        path: null as string | null,
      },
    ];

    for (const { task, path } of enabledCases) {
      renderHook(() => useTaskPrStatus(task, path));
      const entry = queryResults.get(`getPrDetailsByUrl:${task.cloudPrUrl}`);
      expect(entry?.enabled).toBe(true);
    }

    for (const { task, path } of disabledCases) {
      queryResults.clear();
      renderHook(() => useTaskPrStatus(task, path));
      const entries = [...queryResults.entries()].filter(([k]) =>
        k.startsWith("getPrDetailsByUrl:"),
      );
      for (const [, entry] of entries) {
        expect(entry.enabled).toBe(false);
      }
    }
  });

  it("enables linked branch PR lookup only for local tasks with worktree and linkedBranch", () => {
    const task = makeTask({ linkedBranch: "feat/linked" });
    renderHook(() => useTaskPrStatus(task, "/worktree"));

    const entry = queryResults.get("getPrUrlForBranch:feat/linked");
    expect(entry?.enabled).toBe(true);
  });

  it("disables linked branch PR lookup when no worktree path", () => {
    const task = makeTask({ linkedBranch: "feat/linked" });
    renderHook(() => useTaskPrStatus(task, null));

    const entry = queryResults.get("getPrUrlForBranch:feat/linked");
    expect(entry?.enabled).toBe(false);
  });

  it("enables local PR status for worktree tasks without linked branch", () => {
    const task = makeTask({ linkedBranch: null });
    renderHook(() => useTaskPrStatus(task, "/worktree"));

    const entry = queryResults.get("getPrStatus:/worktree");
    expect(entry?.enabled).toBe(true);
  });

  it("disables local PR status when task has a linked branch", () => {
    const task = makeTask({ linkedBranch: "feat/linked" });
    renderHook(() => useTaskPrStatus(task, "/worktree"));

    const entry = queryResults.get("getPrStatus:/worktree");
    expect(entry?.enabled).toBe(false);
  });

  it("disables diff stats for cloud tasks", () => {
    const task = makeTask({ taskRunEnvironment: "cloud" });
    renderHook(() => useTaskPrStatus(task, "/worktree"));

    const entry = queryResults.get("getDiffStats:/worktree");
    expect(entry?.enabled).toBe(false);
  });

  it("disables diff stats when no worktree path", () => {
    const task = makeTask();
    renderHook(() => useTaskPrStatus(task, null));

    const entries = [...queryResults.entries()].filter(([k]) =>
      k.startsWith("getDiffStats:"),
    );
    for (const [, entry] of entries) {
      expect(entry.enabled).toBe(false);
    }
  });
});
