import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks --------------------------------------------------------------

const mockClient = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@features/auth/hooks/authClient", () => ({
  useOptionalAuthenticatedClient: () => mockClient,
}));

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
import { useCreateProject } from "./useCreateProject";
import { useUpdateProject } from "./useUpdateProject";

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

describe("useCreateProject / useUpdateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProject: calls client.createProject with the resolved org id", async () => {
    mockClient.createProject.mockResolvedValueOnce({
      id: 42,
      name: "My Project",
    });

    const queryClient = newClient();
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: makeWrapper(queryClient),
    });

    let mutationResult: unknown;
    await waitFor(async () => {
      mutationResult = await result.current.mutateAsync({
        name: "My Project",
        organizationId: "org-1",
      });
    });

    expect(mockClient.createProject).toHaveBeenCalledTimes(1);
    expect(mockClient.createProject).toHaveBeenCalledWith({
      name: "My Project",
      organizationId: "org-1",
    });
    expect(mutationResult).toEqual({ id: 42, name: "My Project" });
  });

  it("createProject: lazily resolves organizationId from getCurrentUser when omitted", async () => {
    mockClient.getCurrentUser.mockResolvedValueOnce({
      organization: { id: "org-from-user" },
    });
    mockClient.createProject.mockResolvedValueOnce({
      id: 7,
      name: "Auto-Org",
    });

    const queryClient = newClient();
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({ name: "Auto-Org" });
    });

    expect(mockClient.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockClient.createProject).toHaveBeenCalledWith({
      name: "Auto-Org",
      organizationId: "org-from-user",
    });
  });

  it("updateProject: PATCHes with the provided patch body", async () => {
    mockClient.updateProject.mockResolvedValueOnce({ id: 5, name: "new" });

    const queryClient = newClient();
    const { result } = renderHook(() => useUpdateProject(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({
        projectId: 5,
        patch: { name: "new" },
      });
    });

    expect(mockClient.updateProject).toHaveBeenCalledTimes(1);
    expect(mockClient.updateProject).toHaveBeenCalledWith(5, { name: "new" });
  });

  it("createProject: invalidates the projects-list cache on success", async () => {
    mockClient.createProject.mockResolvedValueOnce({ id: 1, name: "x" });

    const queryClient = newClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateProject(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(async () => {
      await result.current.mutateAsync({
        name: "x",
        organizationId: "org-1",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["projects", "list"],
    });
  });
});
