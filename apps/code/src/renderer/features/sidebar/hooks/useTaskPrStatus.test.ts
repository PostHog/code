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

// useQuery is called 6 times per render in a fixed order:
// 0: cloudPrDetails, 1: linkedBranchPrUrl, 2: linkedPrDetails,
// 3: localPrStatus, 4: diffStats, 5: syncStatus
let queryReturnsByIndex: Array<{ data: unknown }> = [];
let queryCallIndex = 0;

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => {
    const result = queryReturnsByIndex[queryCallIndex] ?? { data: undefined };
    queryCallIndex++;
    return result;
  },
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
    queryReturnsByIndex = [];
    queryCallIndex = 0;
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
    queryReturnsByIndex = [];
    queryCallIndex = 0;
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

  it("disables diff stats when task has a linked branch", () => {
    const task = makeTask({ linkedBranch: "feat/linked" });
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

// Helper to set per-query return values by index
function setQueryData(overrides: {
  cloudPrDetails?: unknown;
  linkedBranchPrUrl?: unknown;
  linkedPrDetails?: unknown;
  localPrStatus?: unknown;
  diffStats?: unknown;
  syncStatus?: unknown;
}) {
  queryReturnsByIndex = [
    { data: overrides.cloudPrDetails },
    { data: overrides.linkedBranchPrUrl },
    { data: overrides.linkedPrDetails },
    { data: overrides.localPrStatus },
    { data: overrides.diffStats },
    { data: overrides.syncStatus },
  ];
}

describe("useTaskPrStatus derivation", () => {
  beforeEach(() => {
    queryResults.clear();
    queryReturnsByIndex = [];
    queryCallIndex = 0;
  });

  it("derives open state from cloud PR details", () => {
    const task = makeTask({
      taskRunEnvironment: "cloud",
      cloudPrUrl: "https://github.com/org/repo/pull/1",
    });
    setQueryData({
      cloudPrDetails: { state: "open", merged: false, draft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, null));
    expect(result.current.prState).toBe("open");
  });

  it("derives merged state from cloud PR details", () => {
    const task = makeTask({
      taskRunEnvironment: "cloud",
      cloudPrUrl: "https://github.com/org/repo/pull/1",
    });
    setQueryData({
      cloudPrDetails: { state: "closed", merged: true, draft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, null));
    expect(result.current.prState).toBe("merged");
  });

  it("derives draft state from cloud PR details", () => {
    const task = makeTask({
      taskRunEnvironment: "cloud",
      cloudPrUrl: "https://github.com/org/repo/pull/1",
    });
    setQueryData({
      cloudPrDetails: { state: "open", merged: false, draft: true },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, null));
    expect(result.current.prState).toBe("draft");
  });

  it("derives state from linked branch PR details", () => {
    const task = makeTask({ linkedBranch: "feat/linked" });
    setQueryData({
      linkedPrDetails: { state: "open", merged: false, draft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBe("open");
  });

  it("derives state from local PR status with uppercase state", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      localPrStatus: { prExists: true, prState: "OPEN", isDraft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBe("open");
  });

  it("derives merged from local PR status with MERGED state", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      localPrStatus: { prExists: true, prState: "MERGED", isDraft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBe("merged");
  });

  it("derives draft from local PR status", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      localPrStatus: { prExists: true, prState: "OPEN", isDraft: true },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBe("draft");
  });

  it("returns null prState when local PR does not exist", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      localPrStatus: { prExists: false, prState: null, isDraft: null },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBeNull();
  });

  it("hasDiff is true when filesChanged > 0", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      diffStats: { filesChanged: 3, linesAdded: 10, linesRemoved: 2 },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.hasDiff).toBe(true);
  });

  it("hasDiff is true when aheadOfDefault > 0", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      syncStatus: { aheadOfDefault: 2 },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.hasDiff).toBe(true);
  });

  it("hasDiff is false when no changes and not ahead", () => {
    const task = makeTask({ linkedBranch: null });
    setQueryData({
      diffStats: { filesChanged: 0, linesAdded: 0, linesRemoved: 0 },
      syncStatus: { aheadOfDefault: 0 },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.hasDiff).toBe(false);
  });

  it("cloud PR state takes priority over linked branch data", () => {
    const task = makeTask({
      taskRunEnvironment: "cloud",
      cloudPrUrl: "https://github.com/org/repo/pull/1",
      linkedBranch: "feat/linked",
    });
    setQueryData({
      cloudPrDetails: { state: "open", merged: false, draft: false },
      linkedPrDetails: { state: "closed", merged: false, draft: false },
    });

    const { result } = renderHook(() => useTaskPrStatus(task, "/worktree"));
    expect(result.current.prState).toBe("open");
  });
});
