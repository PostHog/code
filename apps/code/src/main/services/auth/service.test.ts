import { OAUTH_SCOPE_VERSION } from "@shared/constants/oauth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthSessionRepository } from "../../db/repositories/auth-session-repository.mock";
import { decrypt, encrypt } from "../../utils/encryption";
import type { ConnectivityService } from "../connectivity/service";
import type { OAuthService } from "../oauth/service";
import { AuthService } from "./service";

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

describe("AuthService", () => {
  const repository = createMockAuthSessionRepository();
  const oauthService = {
    refreshToken: vi.fn(),
    startFlow: vi.fn(),
    startSignupFlow: vi.fn(),
  } as unknown as OAuthService;
  const connectivityService = {
    getStatus: vi.fn(() => ({ isOnline: true })),
  } as unknown as ConnectivityService;

  let service: AuthService;

  beforeEach(() => {
    repository.clearCurrent();
    vi.clearAllMocks();
    service = new AuthService(repository, oauthService, connectivityService);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await service.logout();
  });

  it("bootstraps to anonymous when there is no stored session", async () => {
    await service.initialize();

    expect(service.getState()).toEqual({
      status: "anonymous",
      bootstrapComplete: true,
      cloudRegion: null,
      projectId: null,
      availableProjectIds: [],
      availableOrgIds: [],
      hasCodeAccess: null,
      needsScopeReauth: false,
    });
  });

  it("requires scope reauthentication when the stored scope version is stale", async () => {
    repository.saveCurrent({
      refreshTokenEncrypted: encrypt("refresh-token"),
      cloudRegion: "us",
      selectedProjectId: 123,
      scopeVersion: OAUTH_SCOPE_VERSION - 1,
    });

    await service.initialize();

    expect(service.getState()).toEqual({
      status: "anonymous",
      bootstrapComplete: true,
      cloudRegion: "us",
      projectId: 123,
      availableProjectIds: [],
      availableOrgIds: [],
      hasCodeAccess: null,
      needsScopeReauth: true,
    });
  });

  it("restores an authenticated session by refreshing the stored refresh token", async () => {
    repository.saveCurrent({
      refreshTokenEncrypted: encrypt("stored-refresh-token"),
      cloudRegion: "us",
      selectedProjectId: 42,
      scopeVersion: OAUTH_SCOPE_VERSION,
    });

    vi.mocked(oauthService.refreshToken).mockResolvedValue({
      success: true,
      data: {
        access_token: "new-access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "",
        scoped_teams: [42, 84],
        scoped_organizations: ["org-1"],
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ has_access: true }),
      }) as unknown as typeof fetch,
    );

    await service.initialize();

    expect(service.getState()).toMatchObject({
      status: "authenticated",
      bootstrapComplete: true,
      cloudRegion: "us",
      projectId: 42,
      availableProjectIds: [42, 84],
      availableOrgIds: ["org-1"],
      hasCodeAccess: true,
      needsScopeReauth: false,
    });

    const persisted = repository.getCurrent();
    expect(persisted).not.toBeNull();
    expect(decrypt(persisted?.refreshTokenEncrypted ?? "")).toBe(
      "rotated-refresh-token",
    );
  });

  it("forces a token refresh when explicitly requested", async () => {
    vi.mocked(oauthService.startFlow).mockResolvedValue({
      success: true,
      data: {
        access_token: "initial-access-token",
        refresh_token: "initial-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "",
        scoped_teams: [42],
        scoped_organizations: ["org-1"],
      },
    });
    vi.mocked(oauthService.refreshToken).mockResolvedValue({
      success: true,
      data: {
        access_token: "refreshed-access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "",
        scoped_teams: [42],
        scoped_organizations: ["org-1"],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ has_access: true }),
      }) as unknown as typeof fetch,
    );

    await service.login("us");

    const token = await service.refreshAccessToken();

    expect(token.accessToken).toBe("refreshed-access-token");
    expect(oauthService.refreshToken).toHaveBeenCalledWith(
      "initial-refresh-token",
      "us",
    );
    expect(decrypt(repository.getCurrent()?.refreshTokenEncrypted ?? "")).toBe(
      "rotated-refresh-token",
    );
  });

  it("preserves the selected project across logout and re-login for the same account", async () => {
    vi.mocked(oauthService.startFlow)
      .mockResolvedValueOnce({
        success: true,
        data: {
          access_token: "initial-access-token",
          refresh_token: "initial-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "",
          scoped_teams: [42, 84],
          scoped_organizations: ["org-1"],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          access_token: "second-access-token",
          refresh_token: "second-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "",
          scoped_teams: [42, 84],
          scoped_organizations: ["org-1"],
        },
      });
    vi.mocked(oauthService.refreshToken).mockResolvedValue({
      success: true,
      data: {
        access_token: "refreshed-access-token",
        refresh_token: "refreshed-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "",
        scoped_teams: [42, 84],
        scoped_organizations: ["org-1"],
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ has_access: true }),
      }) as unknown as typeof fetch,
    );

    await service.login("us");
    await service.selectProject(84);
    await service.logout();

    expect(service.getState()).toMatchObject({
      status: "anonymous",
      cloudRegion: "us",
      projectId: 84,
    });

    await service.login("us");

    expect(service.getState()).toMatchObject({
      status: "authenticated",
      cloudRegion: "us",
      projectId: 84,
      availableProjectIds: [42, 84],
    });
  });
});
