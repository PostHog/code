import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@renderer/trpc/client", () => ({
  trpcClient: {
    auth: {
      getState: { query: vi.fn() },
      onStateChanged: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
      getValidAccessToken: {
        query: vi.fn().mockResolvedValue({
          accessToken: "token",
          apiHost: "https://us.posthog.com",
        }),
      },
      refreshAccessToken: {
        mutate: vi.fn().mockResolvedValue({
          accessToken: "token",
          apiHost: "https://us.posthog.com",
        }),
      },
      login: {
        mutate: vi.fn().mockResolvedValue({
          state: {
            status: "authenticated",
            bootstrapComplete: true,
            cloudRegion: "us",
            projectId: 1,
            availableProjectIds: [1],
            availableOrgIds: [],
            hasCodeAccess: true,
            needsScopeReauth: false,
          },
        }),
      },
      signup: { mutate: vi.fn() },
      selectProject: { mutate: vi.fn() },
      redeemInviteCode: { mutate: vi.fn() },
      logout: {
        mutate: vi.fn().mockResolvedValue({
          status: "anonymous",
          bootstrapComplete: true,
          cloudRegion: null,
          projectId: null,
          availableProjectIds: [],
          availableOrgIds: [],
          hasCodeAccess: null,
          needsScopeReauth: false,
        }),
      },
    },
    analytics: {
      setUserId: { mutate: vi.fn().mockResolvedValue(undefined) },
      resetUser: { mutate: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock("@utils/analytics", () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@utils/queryClient", () => ({
  queryClient: {
    clear: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}));

vi.mock("@stores/navigationStore", () => ({
  useNavigationStore: {
    getState: () => ({ navigateToTaskInput: vi.fn() }),
  },
}));

import {
  resetAuthStoreModuleStateForTest,
  useAuthStore,
} from "@features/auth/stores/authStore";
import { Theme } from "@radix-ui/themes";
import type { ReactElement } from "react";
import { ScopeReauthPrompt } from "./ScopeReauthPrompt";

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>);
}

describe("ScopeReauthPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthStoreModuleStateForTest();
    useAuthStore.setState({
      needsScopeReauth: false,
      cloudRegion: null,
    });
  });

  it("does not render dialog when needsScopeReauth is false", () => {
    renderWithTheme(<ScopeReauthPrompt />);
    expect(
      screen.queryByText("Re-authentication required"),
    ).not.toBeInTheDocument();
  });

  it("renders dialog when needsScopeReauth is true", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: "us" });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByText("Re-authentication required")).toBeInTheDocument();
  });

  it("disables Sign in button when cloudRegion is null", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("enables Sign in button when cloudRegion is set", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: "us" });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
  });

  it("shows Log out button as an escape hatch when cloudRegion is null", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).not.toBeDisabled();
  });

  it("calls logout when Log out button is clicked", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    const state = useAuthStore.getState();
    expect(state.needsScopeReauth).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.cloudRegion).toBeNull();
  });
});
