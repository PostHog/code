import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks --------------------------------------------------------------

const mockTrpcClient = vi.hoisted(() => ({
  scratchpad: {
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

  it("happy path: kills previews, deletes scratchpad + task, invalidates caches", async () => {
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockResolvedValueOnce({
      success: true,
    });
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "task-1" });
    });

    expect(mockTrpcClient.preview.unregister.mutate).toHaveBeenCalledWith({
      taskId: "task-1",
    });
    expect(mockTrpcClient.scratchpad.delete.mutate).toHaveBeenCalledWith({
      taskId: "task-1",
    });
    expect(mockClient.deleteTask).toHaveBeenCalledWith("task-1");

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tasks", "list"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["scratchpad", "list"],
    });
  });

  it("preview unregister failure does NOT abort the rest of the flow", async () => {
    mockTrpcClient.preview.unregister.mutate.mockRejectedValueOnce(
      new Error("boom"),
    );
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

    expect(mockTrpcClient.scratchpad.delete.mutate).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteTask).toHaveBeenCalledTimes(1);
  });

  it("scratchpad delete failure surfaces a toast but the flow continues", async () => {
    mockTrpcClient.preview.unregister.mutate.mockResolvedValueOnce(undefined);
    mockTrpcClient.scratchpad.delete.mutate.mockRejectedValueOnce(
      new Error("disk error"),
    );
    mockClient.deleteTask.mockResolvedValueOnce(undefined);

    const queryClient = newClient();
    const { result } = renderHook(() => useDeleteScratchpad(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ taskId: "t" });
    });

    expect(mockToast.toast.error).toHaveBeenCalledWith(
      "Failed to delete draft files",
    );
    expect(mockClient.deleteTask).toHaveBeenCalledTimes(1);
  });
});
