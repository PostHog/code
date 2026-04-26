import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks --------------------------------------------------------------

const mockTrpcClient = vi.hoisted(() => ({
  scratchpad: {
    readManifest: { query: vi.fn() },
    delete: { mutate: vi.fn() },
    list: { pathFilter: () => ({ queryKey: ["scratchpad", "list"] }) },
  },
  preview: {
    unregister: { mutate: vi.fn() },
  },
}));

const mockTrpc = vi.hoisted(() => ({
  scratchpad: {
    list: { pathFilter: () => ({ queryKey: ["scratchpad", "list"] }) },
  },
}));

const mockClient = vi.hoisted(() => ({
  getProject: vi.fn(),
  deleteProject: vi.fn(),
  deleteTask: vi.fn(),
}));

const mockToast = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@renderer/trpc", () => ({
  trpcClient: mockTrpcClient,
  trpc: mockTrpc,
}));

vi.mock("@features/auth/hooks/authClient", () => ({
  useAuthenticatedClient: () => mockClient,
  useOptionalAuthenticatedClient: () => mockClient,
}));

vi.mock("@utils/toast", () => mockToast);

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Imports after mocks so the modules pick up the mocked dependencies.
import { useDeleteScratchpad } from "./useDeleteScratchpad";

// --- Helpers ------------------------------------------------------------

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// --- Tests --------------------------------------------------------------

describe("useDeleteScratchpad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: runs all steps in order and invalidates caches", async () => {
    mockTrpcClient.scratchpad.readManifest.query.mockResolvedValueOnce({
      projectId: 42,
      published: false,
    });
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.getProject.mockResolvedValueOnce({
      id: 42,
      name: "[UNPUBLISHED] Foo",
    });
    mockClient.deleteProject.mockResolvedValueOnce(undefined);
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "task-1" });
    });

    expect(mockTrpcClient.scratchpad.readManifest.query).toHaveBeenCalledWith({
      taskId: "task-1",
    });
    expect(mockTrpcClient.preview.unregister.mutate).toHaveBeenCalledWith({
      taskId: "task-1",
    });
    expect(mockTrpcClient.scratchpad.delete.mutate).toHaveBeenCalledWith({
      taskId: "task-1",
    });
    expect(mockClient.getProject).toHaveBeenCalledWith(42);
    expect(mockClient.deleteProject).toHaveBeenCalledWith(42);
    expect(mockClient.deleteTask).toHaveBeenCalledWith("task-1");

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tasks", "list"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["scratchpad", "list"],
    });
  });

  it("auto-created project (with [UNPUBLISHED] prefix) IS deleted", async () => {
    mockTrpcClient.scratchpad.readManifest.query.mockResolvedValueOnce({
      projectId: 7,
      published: false,
    });
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.getProject.mockResolvedValueOnce({
      id: 7,
      name: "[UNPUBLISHED] My App",
    });
    mockClient.deleteProject.mockResolvedValueOnce(undefined);
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "t" });
    });

    expect(mockClient.deleteProject).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteProject).toHaveBeenCalledWith(7);
  });

  it("user-picked project (no prefix) is NOT deleted", async () => {
    mockTrpcClient.scratchpad.readManifest.query.mockResolvedValueOnce({
      projectId: 99,
      published: false,
    });
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.getProject.mockResolvedValueOnce({
      id: 99,
      name: "Real Production App",
    });
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "t" });
    });

    expect(mockClient.deleteProject).not.toHaveBeenCalled();
    // task itself is still deleted
    expect(mockClient.deleteTask).toHaveBeenCalledWith("t");
  });

  it("preview unregister failure does NOT abort the rest of the flow", async () => {
    mockTrpcClient.scratchpad.readManifest.query.mockResolvedValueOnce({
      projectId: 42,
      published: false,
    });
    mockTrpcClient.preview.unregister.mutate.mockRejectedValueOnce(
      new Error("boom"),
    );
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.getProject.mockResolvedValueOnce({
      id: 42,
      name: "[UNPUBLISHED] X",
    });
    mockClient.deleteProject.mockResolvedValueOnce(undefined);
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "t" });
    });

    // The flow should have continued past the failed preview unregister.
    expect(mockTrpcClient.scratchpad.delete.mutate).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteProject).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteTask).toHaveBeenCalledTimes(1);
  });

  it("manifest read failure: flow continues without project deletion", async () => {
    mockTrpcClient.scratchpad.readManifest.query.mockRejectedValueOnce(
      new Error("not found"),
    );
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "t" });
    });

    expect(mockClient.getProject).not.toHaveBeenCalled();
    expect(mockClient.deleteProject).not.toHaveBeenCalled();
    expect(mockTrpcClient.scratchpad.delete.mutate).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteTask).toHaveBeenCalledTimes(1);
  });
});
