import { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc/client";
import {
  getCloudUrlFromRegion,
  OAUTH_SCOPE_VERSION,
  OAUTH_SCOPES,
} from "@shared/constants/oauth";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import type { CloudRegion } from "@shared/types/oauth";
import { useNavigationStore } from "@stores/navigationStore";
import {
  identifyUser,
  isFeatureFlagEnabled,
  reloadFeatureFlags,
  resetUser,
  track,
} from "@utils/analytics";
import { electronStorage } from "@utils/electronStorage";
import { logger } from "@utils/logger";
import { queryClient } from "@utils/queryClient";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

const log = logger.scope("auth-store");

let initializePromise: Promise<boolean> | null = null;

let sessionResetCallback: (() => void) | null = null;

export function setSessionResetCallback(callback: () => void) {
  sessionResetCallback = callback;
}

async function refreshTokenViaService(): Promise<string> {
  const result = await trpcClient.auth.refreshAccessToken.mutate();
  return result.accessToken;
}

function pushTokensToService(tokens: StoredTokens): void {
  trpcClient.auth.setTokens
    .mutate(tokens)
    .catch((err) => log.warn("Failed to push tokens to auth service", err));
}

function buildClient(
  accessToken: string,
  apiHost: string,
  teamId?: number,
): PostHogAPIClient {
  return new PostHogAPIClient(
    accessToken,
    apiHost,
    refreshTokenViaService,
    teamId,
  );
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudRegion: CloudRegion;
  scopedTeams?: number[];
  scopeVersion?: number;
}

interface AuthState {
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  tokenExpiry: number | null; // Unix timestamp in milliseconds
  cloudRegion: CloudRegion | null;
  storedTokens: StoredTokens | null;
  staleTokens: StoredTokens | null;

  isAuthenticated: boolean;
  client: PostHogAPIClient | null;
  projectId: number | null; // Current team/project ID

  availableProjectIds: number[];
  availableOrgIds: string[];
  needsProjectSelection: boolean;

  needsScopeReauth: boolean; // True when stored token scope version is stale

  hasCodeAccess: boolean | null;

  hasCompletedOnboarding: boolean;
  selectedPlan: "free" | "pro" | null;
  selectedOrgId: string | null;

  checkCodeAccess: () => void;
  redeemInviteCode: (code: string) => Promise<void>;

  loginWithOAuth: (region: CloudRegion) => Promise<void>;
  initializeOAuth: () => Promise<boolean>;

  signupWithOAuth: (region: CloudRegion) => Promise<void>;

  selectProject: (projectId: number) => void;

  completeOnboarding: () => void;
  selectPlan: (plan: "free" | "pro") => void;
  selectOrg: (orgId: string) => void;

  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        oauthAccessToken: null,
        oauthRefreshToken: null,
        tokenExpiry: null,
        cloudRegion: null,
        storedTokens: null,
        staleTokens: null,

        isAuthenticated: false,
        client: null,
        projectId: null,

        availableProjectIds: [],
        availableOrgIds: [],
        needsProjectSelection: false,
        needsScopeReauth: false,

        hasCodeAccess: null,

        hasCompletedOnboarding: false,
        selectedPlan: null,
        selectedOrgId: null,

        checkCodeAccess: () => {
          const state = get();
          if (!state.cloudRegion || !state.oauthAccessToken) {
            set({ hasCodeAccess: false });
            return;
          }

          set({ hasCodeAccess: null });

          const baseUrl = getCloudUrlFromRegion(state.cloudRegion);
          fetch(`${baseUrl}/api/code/invites/check-access/`, {
            headers: {
              Authorization: `Bearer ${state.oauthAccessToken}`,
            },
          })
            .then((res) => res.json())
            .then((data) => {
              set({ hasCodeAccess: data.has_access === true });
            })
            .catch((err) => {
              log.error("Failed to check code access", err);
              set({ hasCodeAccess: isFeatureFlagEnabled("tasks") });
            });
        },

        redeemInviteCode: async (code: string) => {
          const state = get();
          if (!state.cloudRegion || !state.oauthAccessToken) {
            throw new Error("Not authenticated");
          }

          const baseUrl = getCloudUrlFromRegion(state.cloudRegion);
          const response = await fetch(`${baseUrl}/api/code/invites/redeem/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${state.oauthAccessToken}`,
            },
            body: JSON.stringify({ code }),
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to redeem invite code");
          }

          set({ hasCodeAccess: true });
          reloadFeatureFlags();
        },

        loginWithOAuth: async (region: CloudRegion) => {
          const result = await trpcClient.oauth.startFlow.mutate({ region });

          if (!result.success || !result.data) {
            throw new Error(result.error || "OAuth flow failed");
          }

          const tokenResponse = result.data;
          const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

          const scopedTeams = tokenResponse.scoped_teams ?? [];
          const scopedOrgs = tokenResponse.scoped_organizations ?? [];

          if (scopedTeams.length === 0) {
            throw new Error("No team found in OAuth scopes");
          }

          const storedTokens: StoredTokens = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
            cloudRegion: region,
            scopedTeams,
            scopeVersion: OAUTH_SCOPE_VERSION,
          };

          const apiHost = getCloudUrlFromRegion(region);
          const client = buildClient(
            tokenResponse.access_token,
            apiHost,
            scopedTeams[0],
          );

          try {
            const user = await client.getCurrentUser();

            const userCurrentTeam = user?.team?.id;
            const storedProjectId = get().projectId;
            const selectedProjectId =
              userCurrentTeam != null && scopedTeams.includes(userCurrentTeam)
                ? userCurrentTeam
                : storedProjectId !== null &&
                    scopedTeams.includes(storedProjectId)
                  ? storedProjectId
                  : scopedTeams[0];

            client.setTeamId(selectedProjectId);

            set({
              oauthAccessToken: tokenResponse.access_token,
              oauthRefreshToken: tokenResponse.refresh_token,
              tokenExpiry: expiresAt,
              cloudRegion: region,
              storedTokens,
              isAuthenticated: true,
              client,
              projectId: selectedProjectId,
              availableProjectIds: scopedTeams,
              availableOrgIds: scopedOrgs,
              needsProjectSelection: false,
              needsScopeReauth: false,
            });

            pushTokensToService(storedTokens);

            queryClient.clear();
            queryClient.setQueryData(["currentUser"], user);

            const distinctId = user.distinct_id || user.email;
            identifyUser(distinctId, {
              email: user.email,
              uuid: user.uuid,
              project_id: selectedProjectId.toString(),
              region,
            });
            track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
              project_id: selectedProjectId.toString(),
              region,
            });

            trpcClient.analytics.setUserId.mutate({
              userId: distinctId,
              properties: {
                email: user.email,
                uuid: user.uuid,
                project_id: selectedProjectId.toString(),
                region,
              },
            });

            get().checkCodeAccess();
          } catch (error) {
            log.error("Failed to authenticate with PostHog", error);
            throw new Error("Failed to authenticate with PostHog");
          }
        },

        initializeOAuth: async () => {
          if (initializePromise) {
            log.debug("OAuth initialization already in progress, waiting...");
            return initializePromise;
          }

          const doInitialize = async (): Promise<boolean> => {
            if (!useAuthStore.persist.hasHydrated()) {
              await new Promise<void>((resolve) => {
                useAuthStore.persist.onFinishHydration(() => resolve());
              });
            }

            const state = get();

            if (state.storedTokens) {
              const tokens = state.storedTokens;
              const tokenScopeVersion = tokens.scopeVersion ?? 0;
              if (tokenScopeVersion < OAUTH_SCOPE_VERSION) {
                log.info("OAuth scopes updated, re-authentication required", {
                  tokenVersion: tokenScopeVersion,
                  requiredVersion: OAUTH_SCOPE_VERSION,
                  requiredScopes: OAUTH_SCOPES,
                });
                set({
                  needsScopeReauth: true,
                  oauthAccessToken: tokens.accessToken,
                  oauthRefreshToken: tokens.refreshToken,
                  tokenExpiry: tokens.expiresAt,
                  cloudRegion: tokens.cloudRegion,
                  isAuthenticated: true,
                });
                return true;
              }

              const isExpired = tokens.expiresAt <= Date.now();

              set({
                oauthAccessToken: tokens.accessToken,
                oauthRefreshToken: tokens.refreshToken,
                tokenExpiry: tokens.expiresAt,
                cloudRegion: tokens.cloudRegion,
              });

              pushTokensToService(tokens);

              if (isExpired) {
                try {
                  const newToken = await refreshTokenViaService();
                  set({ oauthAccessToken: newToken });
                } catch (error) {
                  log.error("Failed to refresh expired token:", error);
                  set({
                    storedTokens: null,
                    isAuthenticated: false,
                    needsScopeReauth: false,
                  });
                  return false;
                }
              }

              const currentTokens = get().storedTokens;
              if (!currentTokens) {
                return false;
              }

              const apiHost = getCloudUrlFromRegion(currentTokens.cloudRegion);
              const scopedTeams = currentTokens.scopedTeams ?? [];

              if (scopedTeams.length === 0) {
                log.error("No projects found in stored tokens");
                get().logout();
                return false;
              }

              const storedProjectId = get().projectId;
              const availableProjects =
                get().availableProjectIds.length > 0
                  ? get().availableProjectIds
                  : scopedTeams;
              const hasValidStoredProject =
                storedProjectId !== null &&
                availableProjects.includes(storedProjectId);

              const client = buildClient(
                get().oauthAccessToken ?? currentTokens.accessToken,
                apiHost,
                hasValidStoredProject ? storedProjectId : scopedTeams[0],
              );

              try {
                const user = await client.getCurrentUser();

                const userCurrentTeam = user?.team?.id;
                const selectedProjectId = hasValidStoredProject
                  ? storedProjectId
                  : userCurrentTeam != null &&
                      scopedTeams.includes(userCurrentTeam)
                    ? userCurrentTeam
                    : scopedTeams[0];

                client.setTeamId(selectedProjectId);

                set({
                  isAuthenticated: true,
                  client,
                  projectId: selectedProjectId,
                  availableProjectIds: scopedTeams,
                  needsProjectSelection: false,
                });

                queryClient.setQueryData(["currentUser"], user);

                const distinctId = user.distinct_id || user.email;
                identifyUser(distinctId, {
                  email: user.email,
                  uuid: user.uuid,
                  project_id: selectedProjectId.toString(),
                  region: tokens.cloudRegion,
                });

                trpcClient.analytics.setUserId.mutate({
                  userId: distinctId,
                  properties: {
                    email: user.email,
                    uuid: user.uuid,
                    project_id: selectedProjectId.toString(),
                    region: tokens.cloudRegion,
                  },
                });

                get().checkCodeAccess();

                return true;
              } catch (error) {
                log.error("Failed to validate OAuth session:", error);

                const isNetworkError =
                  error instanceof Error && error.cause instanceof TypeError;

                if (isNetworkError) {
                  log.warn(
                    "Network error during session validation - keeping session active",
                  );
                  const fallbackProjectId = hasValidStoredProject
                    ? storedProjectId
                    : scopedTeams[0];
                  set({
                    isAuthenticated: true,
                    client,
                    projectId: fallbackProjectId,
                    availableProjectIds: scopedTeams,
                    needsProjectSelection: false,
                  });
                  return true;
                }

                set({
                  storedTokens: null,
                  isAuthenticated: false,
                  needsScopeReauth: false,
                });
                return false;
              }
            }

            return state.isAuthenticated;
          };

          initializePromise = doInitialize().finally(() => {
            initializePromise = null;
          });

          return initializePromise;
        },

        signupWithOAuth: async (region: CloudRegion) => {
          const result = await trpcClient.oauth.startSignupFlow.mutate({
            region,
          });

          if (!result.success || !result.data) {
            throw new Error(result.error || "Signup failed");
          }

          const tokenResponse = result.data;
          const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

          const scopedTeams = tokenResponse.scoped_teams ?? [];
          const scopedOrgs = tokenResponse.scoped_organizations ?? [];

          if (scopedTeams.length === 0) {
            throw new Error("No team found in OAuth scopes");
          }

          const storedTokens: StoredTokens = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
            cloudRegion: region,
            scopedTeams,
            scopeVersion: OAUTH_SCOPE_VERSION,
          };

          const apiHost = getCloudUrlFromRegion(region);
          const selectedProjectId = scopedTeams[0];

          const client = buildClient(
            tokenResponse.access_token,
            apiHost,
            selectedProjectId,
          );

          try {
            const user = await client.getCurrentUser();

            set({
              oauthAccessToken: tokenResponse.access_token,
              oauthRefreshToken: tokenResponse.refresh_token,
              tokenExpiry: expiresAt,
              cloudRegion: region,
              storedTokens,
              isAuthenticated: true,
              client,
              projectId: selectedProjectId,
              availableProjectIds: scopedTeams,
              availableOrgIds: scopedOrgs,
              needsProjectSelection: false,
              needsScopeReauth: false,
            });

            pushTokensToService(storedTokens);

            queryClient.clear();
            queryClient.setQueryData(["currentUser"], user);

            const distinctId = user.distinct_id || user.email;
            identifyUser(distinctId, {
              email: user.email,
              uuid: user.uuid,
              project_id: selectedProjectId.toString(),
              region,
            });
            track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
              project_id: selectedProjectId.toString(),
              region,
            });

            trpcClient.analytics.setUserId.mutate({
              userId: distinctId,
              properties: {
                email: user.email,
                uuid: user.uuid,
                project_id: selectedProjectId.toString(),
                region,
              },
            });

            get().checkCodeAccess();
          } catch (error) {
            log.error("Failed to authenticate with PostHog", error);
            throw new Error("Failed to authenticate with PostHog");
          }
        },

        selectProject: (projectId: number) => {
          const state = get();

          if (!state.availableProjectIds.includes(projectId)) {
            log.error("Attempted to select invalid project", { projectId });
            throw new Error("Invalid project selection");
          }

          const cloudRegion = state.cloudRegion;
          if (!cloudRegion) {
            throw new Error("No cloud region available");
          }

          const accessToken = state.oauthAccessToken;
          if (!accessToken) {
            throw new Error("No access token available");
          }

          sessionResetCallback?.();

          const apiHost = getCloudUrlFromRegion(cloudRegion);
          const client = buildClient(accessToken, apiHost, projectId);

          const updatedTokens = state.storedTokens
            ? { ...state.storedTokens, scopedTeams: state.availableProjectIds }
            : null;

          set({
            projectId,
            client,
            needsProjectSelection: false,
            storedTokens: updatedTokens,
          });

          queryClient.removeQueries({
            predicate: (query) => {
              const key = Array.isArray(query.queryKey)
                ? query.queryKey[0]
                : query.queryKey;
              return key !== "currentUser";
            },
          });

          useNavigationStore.getState().navigateToTaskInput();

          track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
            project_id: projectId.toString(),
            region: cloudRegion,
          });

          log.info("Project selected", { projectId });
        },

        completeOnboarding: () => {
          set({ hasCompletedOnboarding: true });
        },

        selectPlan: (plan: "free" | "pro") => {
          set({ selectedPlan: plan });
        },

        selectOrg: (orgId: string) => {
          set({ selectedOrgId: orgId });
        },

        logout: () => {
          track(ANALYTICS_EVENTS.USER_LOGGED_OUT);
          resetUser();

          sessionResetCallback?.();

          trpcClient.analytics.resetUser.mutate();
          trpcClient.auth.clearTokens
            .mutate()
            .catch((err) =>
              log.warn("Failed to clear tokens on auth service", err),
            );

          queryClient.clear();

          useNavigationStore.getState().navigateToTaskInput();

          const currentTokens = get().storedTokens;

          set({
            oauthAccessToken: null,
            oauthRefreshToken: null,
            tokenExpiry: null,
            cloudRegion: null,
            storedTokens: null,
            staleTokens: currentTokens,
            isAuthenticated: false,
            client: null,
            projectId: null,
            availableProjectIds: [],
            availableOrgIds: [],
            needsProjectSelection: false,
            needsScopeReauth: false,
            hasCodeAccess: null,
            selectedPlan: null,
            selectedOrgId: null,
          });
        },
      }),
      {
        name: "array-auth",
        storage: electronStorage,
        partialize: (state) => ({
          cloudRegion: state.cloudRegion,
          storedTokens: state.storedTokens,
          staleTokens: state.staleTokens,
          projectId: state.projectId,
          availableProjectIds: state.availableProjectIds,
          availableOrgIds: state.availableOrgIds,
          hasCodeAccess: state.hasCodeAccess,
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          selectedPlan: state.selectedPlan,
          selectedOrgId: state.selectedOrgId,
        }),
      },
    ),
  ),
);

export function initializeAuthSubscriptions(): () => void {
  const tokenSub = trpcClient.auth.onTokenUpdated.subscribe(undefined, {
    onData: ({ accessToken }) => {
      useAuthStore.setState({ oauthAccessToken: accessToken });
    },
    onError: (error) => {
      log.error("Token update subscription error", { error });
    },
  });

  const authErrorSub = trpcClient.auth.onAuthError.subscribe(undefined, {
    onData: ({ reason }) => {
      log.error("Auth service reported error", { reason });
      useAuthStore.getState().logout();
    },
    onError: (error) => {
      log.error("Auth error subscription error", { error });
    },
  });

  const logoutSub = trpcClient.auth.onLogout.subscribe(undefined, {
    onData: () => {
      useAuthStore.getState().logout();
    },
    onError: (error) => {
      log.error("Logout subscription error", { error });
    },
  });

  return () => {
    tokenSub.unsubscribe();
    authErrorSub.unsubscribe();
    logoutSub.unsubscribe();
  };
}
