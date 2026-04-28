import { Theme } from "@radix-ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ------------------------------------------------------

const mockPublishMutate = vi.hoisted(() => vi.fn());

const mockClient = vi.hoisted(() => ({
  getGithubLogin: vi.fn().mockResolvedValue("octocat"),
}));

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockWriteManifest = vi.hoisted(() => vi.fn());

const mockTrpc = vi.hoisted(() => ({
  git: {
    getGhAuthToken: {
      queryOptions: (
        _input: undefined,
        opts: { enabled?: boolean; staleTime?: number } = {},
      ) => ({
        queryKey: ["git", "getGhAuthToken"],
        queryFn: async () => mockGetGhAuthToken(),
        enabled: opts.enabled ?? true,
        staleTime: opts.staleTime,
      }),
    },
  },
  scratchpad: {
    readManifest: {
      queryOptions: (
        input: { taskId: string },
        opts: { enabled?: boolean; staleTime?: number } = {},
      ) => ({
        queryKey: ["scratchpad", "readManifest", input.taskId],
        queryFn: async () => mockReadManifest(input),
        enabled: opts.enabled ?? true,
        staleTime: opts.staleTime,
      }),
      queryFilter: (input: { taskId: string }) => ({
        queryKey: ["scratchpad", "readManifest", input.taskId],
      }),
    },
  },
}));

const mockTrpcClient = vi.hoisted(() => ({
  scratchpad: {
    writeManifest: { mutate: mockWriteManifest },
  },
}));

const mockGetGhAuthToken = vi.hoisted(() => vi.fn());

const mockToast = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@hooks/useAuthenticatedClient", () => ({
  useAuthenticatedClient: () => mockClient,
}));

vi.mock("@features/posthog-projects/hooks/useCreateProject", () => ({
  useCreateProject: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@features/scratchpads/hooks/usePublishScratchpad", () => ({
  usePublishScratchpad: () => ({
    isPending: false,
    mutateAsync: mockPublishMutate,
  }),
}));

vi.mock("@renderer/trpc", () => ({
  trpc: mockTrpc,
  trpcClient: mockTrpcClient,
}));

vi.mock("@features/scratchpads/components/ProjectPicker", () => ({
  ProjectPicker: () => null,
}));

vi.mock("@utils/toast", () => mockToast);

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Imports after mocks.
import { PublishDialog } from "./PublishDialog";

// --- Helpers ------------------------------------------------------------

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderDialog(props?: Partial<Parameters<typeof PublishDialog>[0]>) {
  const queryClient = newClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Theme>{children}</Theme>
    </QueryClientProvider>
  );

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    taskId: "task-1",
    defaultRepoName: "my-product",
    productName: "My Product",
    ...props,
  };

  return {
    ...render(<PublishDialog {...defaultProps} />, { wrapper }),
    props: defaultProps,
    queryClient,
  };
}

// --- Tests --------------------------------------------------------------

describe("PublishDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGhAuthToken.mockResolvedValue({
      success: true,
      token: "ghp_xxx",
      error: null,
    });
    // Default: scratchpad already has a linked project so the project-link
    // step in the dialog is hidden. Tests that need the link step override
    // this.
    mockReadManifest.mockResolvedValue({
      projectId: 1,
      published: false,
    });
    mockWriteManifest.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders with the sanitized default repo name and private visibility", async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByDisplayValue("my-product")).toBeInTheDocument();
    });
    // Private radio is selected by default.
    const privateRadio = screen.getByRole("radio", { name: /private/i });
    expect(privateRadio).toHaveAttribute("data-state", "checked");
  });

  it("happy path: submits with valid inputs", async () => {
    mockPublishMutate.mockResolvedValueOnce({
      kind: "success",
      result: {
        success: true,
        manifest: {
          projectId: 1,
          published: true,
          publishedAt: "2026-04-26T00:00:00.000Z",
          githubRemote: "git@github.com:octocat/my-product.git",
        },
        repoFullName: "octocat/my-product",
        githubRemote: "git@github.com:octocat/my-product.git",
      },
    });

    const { props } = renderDialog();

    // Wait for the gh-token query to resolve.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(mockPublishMutate).toHaveBeenCalledWith({
        taskId: "task-1",
        repoName: "my-product",
        visibility: "private",
      });
    });

    await waitFor(() => {
      expect(mockToast.toast.success).toHaveBeenCalled();
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("repo-name conflict surfaces inline; user can rename and retry", async () => {
    mockPublishMutate.mockResolvedValueOnce({
      kind: "failure",
      result: {
        success: false,
        code: "repo_name_conflict",
        message: 'A repository named "my-product" already exists.',
      },
    });

    renderDialog();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/already exists/);
    });

    // Rename and retry.
    mockPublishMutate.mockResolvedValueOnce({
      kind: "success",
      result: {
        success: true,
        manifest: {
          projectId: 1,
          published: true,
          publishedAt: "2026-04-26T00:00:00.000Z",
          githubRemote: "git@github.com:octocat/my-product-2.git",
        },
        repoFullName: "octocat/my-product-2",
        githubRemote: "git@github.com:octocat/my-product-2.git",
      },
    });

    const input = screen.getByDisplayValue("my-product");
    fireEvent.change(input, { target: { value: "my-product-2" } });

    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(mockPublishMutate).toHaveBeenCalledTimes(2);
    });
    expect(mockPublishMutate.mock.calls[1][0]).toMatchObject({
      repoName: "my-product-2",
    });
  });

  it("already-published failure surfaces inline", async () => {
    mockPublishMutate.mockResolvedValueOnce({
      kind: "failure",
      result: {
        success: false,
        code: "already_published",
        message: "Already published",
      },
    });

    renderDialog();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Already published/);
    });
  });

  it("disables submit when no gh token", async () => {
    mockGetGhAuthToken.mockResolvedValue({
      success: false,
      token: null,
      error: "not signed in",
    });
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Sign in to GitHub/);
  });

  it("secret-leakage failure surfaces offending paths", async () => {
    mockPublishMutate.mockResolvedValueOnce({
      kind: "failure",
      result: {
        success: false,
        code: "secret_leakage",
        message:
          "Refusing to publish: 2 file(s) look like secrets or are too large.",
        paths: [".env", "private.pem"],
      },
    });

    renderDialog();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByText(".env")).toBeInTheDocument();
      expect(screen.getByText("private.pem")).toBeInTheDocument();
    });

    // Submit is disabled until "Re-check" is clicked.
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /re-check/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).not.toBeDisabled();
    });
  });

  it("validates repo name (only letters/numbers/._-)", async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByDisplayValue("my-product")).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue("my-product");
    fireEvent.change(input, { target: { value: "bad name with spaces" } });

    await waitFor(() => {
      expect(
        screen.getByText(/Use letters, numbers, dots, dashes/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
  });
});
