import { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc/client";
import {
  getCloudUrlFromRegion,
  OAUTH_SCOPE_VERSION,
  OAUTH_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
  TOKEN_REFRESH_FORCE_MS,
} from "@shared/constants/oauth";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import type { CloudRegion } from "@shared/types/oauth";
import { sleepWithBackoff } from "@shared/utils/backoff";
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

let refreshPromise: Promise<void> | null = null;
let initializePromise: Promise<boolean> | null = null;

let sessionResetCallback: (() => void) | null = null;

export function setSessionResetCallback(callback: () => void) {
  sessionResetCallback = callback;
}

const REFRESH_MAX_RETRIES = 3;
const REFRESH_INITIAL_DELAY_MS = 1000;

function updateServiceTokens(token: string): void {
  trpcClient.agent.updateToken
    .mutate({ token })
    .catch((err) => log.warn("Failed to update agent token", err));
  trpcClient.cloudTask.updateToken
    .mutate({ token })
    .catch((err) => log.warn("Failed to update cloud task token", err));
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudRegion: CloudRegion;
  scopeVersion?: number;
}

export interface OrgProjects {
  orgName: string;
  projects: { id: number; name: string }[];
}

interface AuthState {
  // OAuth state
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  tokenExpiry: number | null; // Unix timestamp in milliseconds
  cloudRegion: CloudRegion | null;
  storedTokens: StoredTokens | null;
  staleTokens: StoredTokens | null;

  // PostHog client
  isAuthenticated: boolean;
  client: PostHogAPIClient | null;
  projectId: number | null; // Current team/project ID

  // Multi-project state — keyed by org ID
  orgProjectsMap: Record<string, OrgProjects>;
  needsProjectSelection: boolean; // True when multiple projects and no selection stored

  needsScopeReauth: boolean; // True when stored token scope version is stale

  // Access gate state
  hasCodeAccess: boolean | null; // null = not yet checked

  // Onboarding state
  hasCompletedOnboarding: boolean;
  selectedPlan: "free" | "pro" | null;
  selectedOrgId: string | null;

  // Access gate methods
  checkCodeAccess: () => void;
  redeemInviteCode: (code: string) => Promise<void>;

  // OAuth methods
  loginWithOAuth: (region: CloudRegion) => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  scheduleTokenRefresh: () => void;
  initializeOAuth: () => Promise<boolean>;

  // Signup method
  signupWithOAuth: (region: CloudRegion) => Promise<void>;

  // Project selection
  selectProject: (projectId: number) => void;

  // Organization switching
  switchOrg: (orgId: string) => Promise<void>;

  // Onboarding methods
  completeOnboarding: () => void;
  selectPlan: (plan: "free" | "pro") => void;
  selectOrg: (orgId: string) => void;

  // Other methods
  logout: () => void;
}

let refreshTimeoutId: number | null = null;

function isTokenExpiringSoon(tokenExpiry: number | null): boolean {
  return (
    tokenExpiry != null && tokenExpiry - Date.now() <= TOKEN_REFRESH_FORCE_MS
  );
}

async function attemptRefreshWithActivityCheck(
  getState: () => AuthState,
): Promise<void> {
  try {
    // If the token is about to expire, skip the activity check and refresh immediately
    if (isTokenExpiringSoon(getState().tokenExpiry)) {
      log.warn(
        "Token expiring imminently, forcing refresh despite active sessions",
      );
      await getState().refreshAccessToken();
      return;
    }

    // Refresh if there are no active sessions
    const hasActive = await trpcClient.agent.hasActiveSessions.query();
    if (!hasActive) {
      await getState().refreshAccessToken();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (reason: string, fn: () => Promise<void>) => {
        if (settled) return;
        settled = true;
        subscription.unsubscribe();
        window.clearInterval(expiryCheckId);
        log.info(`Settling activity wait: ${reason}`);
        fn().then(resolve).catch(reject);
      };

      // Subscribe to the idle event
      const subscription = trpcClient.agent.onSessionsIdle.subscribe(
        undefined,
        {
          onData: () =>
            settle("sessions idle", () => getState().refreshAccessToken()),
          onError: (error) => {
            log.warn(
              "Sessions idle subscription failed, refreshing anyway",
              error,
            );
            settle("subscription error", () => getState().refreshAccessToken());
          },
        },
      );

      // Safety net: if the token is about to expire while we wait, force refresh
      const expiryCheckId = window.setInterval(() => {
        if (isTokenExpiringSoon(getState().tokenExpiry)) {
          settle("token expiring imminently", () =>
            getState().refreshAccessToken(),
          );
        }
      }, TOKEN_REFRESH_FORCE_MS / 2);
    });
  } catch (error) {
    // IPC call failed — refresh anyway (better than letting the token expire)
    log.warn("Activity check failed, refreshing token anyway", error);
    await getState().refreshAccessToken();
  }
}

async function buildOrgProjectsMap(
  user: Record<string, unknown>,
  client: PostHogAPIClient,
): Promise<Record<string, OrgProjects>> {
  const orgs = (user?.organizations ?? []) as {
    id: string;
    name?: string;
  }[];

  const map: Record<string, OrgProjects> = {};
  for (const org of orgs) {
    map[org.id] = {
      orgName: org.name ?? "Unknown Organization",
      projects: [],
    };
  }

  // Try the first org to check if org-level endpoints are accessible.
  // If not (e.g. project-scoped token), skip the rest and fall back to
  // the project-scoped endpoint.
  if (orgs.length > 0) {
    try {
      map[orgs[0].id].projects = await client.listOrgProjects(orgs[0].id);

      // First org worked, fetch the rest in parallel
      if (orgs.length > 1) {
        const rest = await Promise.all(
          orgs.slice(1).map(async (org) => {
            const projects = await client
              .listOrgProjects(org.id)
              .catch((err) => {
                log.warn("Failed to fetch projects for org", {
                  orgId: org.id,
                  err,
                });
                return [];
              });
            return [org.id, projects] as const;
          }),
        );
        for (const [orgId, projects] of rest) {
          map[orgId].projects = projects;
        }
      }

      return map;
    } catch (err) {
      log.warn(
        "Org-level project listing unavailable, falling back to project endpoint",
        { err },
      );
    }
  }

  // Fallback: switch into each org and read team from /me.
  // Both switchOrganization and getCurrentUser are user-level endpoints
  // that work regardless of token scoping.
  const currentOrgId = (user?.organization as { id?: string } | undefined)?.id;

  for (const org of orgs) {
    try {
      let orgUser: Record<string, unknown>;
      if (org.id === currentOrgId) {
        orgUser = user;
      } else {
        await client.switchOrganization(org.id);
        orgUser = await client.getCurrentUser();
      }

      const team = orgUser?.team as { id?: number; name?: string } | undefined;
      if (team?.id && map[org.id]) {
        map[org.id].projects = [
          { id: team.id, name: team.name ?? `Project ${team.id}` },
        ];
      }
    } catch (err) {
      log.warn("Failed to fetch project via org switch", {
        orgId: org.id,
        err,
      });
    }
  }

  // Switch back to the original org
  if (currentOrgId && orgs.length > 1) {
    await client.switchOrganization(currentOrgId).catch((err) => {
      log.warn("Failed to switch back to original org", { err });
    });
  }

  return map;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // OAuth state
        oauthAccessToken: null,
        oauthRefreshToken: null,
        tokenExpiry: null,
        cloudRegion: null,
        storedTokens: null,
        staleTokens: null,

        // PostHog client
        isAuthenticated: false,
        client: null,
        projectId: null,

        // Multi-project state
        orgProjectsMap: {},
        needsProjectSelection: false,
        // Scope re-auth state
        needsScopeReauth: false,

        // Access gate state
        hasCodeAccess: null,

        // Onboarding state
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
              // On network error, fall back to feature flag check
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

          // Optimistically grant access — the flag will catch up on next launch
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
          const storedTokens: StoredTokens = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
            cloudRegion: region,
            scopeVersion: OAUTH_SCOPE_VERSION,
          };

          const apiHost = getCloudUrlFromRegion(region);

          const client = new PostHogAPIClient(
            tokenResponse.access_token,
            apiHost,
            async () => {
              await get().refreshAccessToken();
              const token = get().oauthAccessToken;
              if (!token) {
                throw new Error("No access token after refresh");
              }
              return token;
            },
          );

          try {
            const user = await client.getCurrentUser();
            const orgProjectsMap = await buildOrgProjectsMap(user, client);

            const userCurrentTeam = user?.team?.id;
            const storedProjectId = get().projectId;
            const selectedProjectId = userCurrentTeam ?? storedProjectId;

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
              orgProjectsMap,
              needsProjectSelection: false,
              needsScopeReauth: false,
            });

            updateServiceTokens(tokenResponse.access_token);

            // Clear any cached data from previous sessions AFTER setting new auth
            queryClient.clear();
            queryClient.setQueryData(["currentUser"], user);

            get().scheduleTokenRefresh();

            // Track user login - use distinct_id to match web sessions (same as PostHog web app)
            const distinctId = user.distinct_id || user.email;
            identifyUser(distinctId, {
              email: user.email,
              uuid: user.uuid,
              project_id: selectedProjectId?.toString(),
              region,
            });
            track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
              project_id: selectedProjectId?.toString(),
              region,
            });

            trpcClient.analytics.setUserId.mutate({
              userId: distinctId,
              properties: {
                email: user.email,
                uuid: user.uuid,
                project_id: selectedProjectId?.toString(),
                region,
              },
            });

            get().checkCodeAccess();
          } catch (error) {
            log.error("Failed to authenticate with PostHog", error);
            throw new Error("Failed to authenticate with PostHog");
          }
        },

        refreshAccessToken: async () => {
          // If a refresh is already in progress, wait for it
          if (refreshPromise) {
            log.debug("Token refresh already in progress, waiting...");
            return refreshPromise;
          }

          const doRefresh = async () => {
            const state = get();

            if (!state.oauthRefreshToken || !state.cloudRegion) {
              throw new Error("No refresh token available");
            }

            // Retry with exponential backoff
            let lastError: Error | null = null;
            for (let attempt = 0; attempt < REFRESH_MAX_RETRIES; attempt++) {
              try {
                if (attempt > 0) {
                  log.debug(
                    `Retrying token refresh (attempt ${
                      attempt + 1
                    }/${REFRESH_MAX_RETRIES})`,
                  );
                  await sleepWithBackoff(attempt - 1, {
                    initialDelayMs: REFRESH_INITIAL_DELAY_MS,
                  });
                }

                const result = await trpcClient.oauth.refreshToken.mutate({
                  refreshToken: state.oauthRefreshToken,
                  region: state.cloudRegion,
                });

                if (!result.success || !result.data) {
                  // Network/server errors should retry, auth errors should logout immediately
                  if (
                    result.errorCode === "network_error" ||
                    result.errorCode === "server_error"
                  ) {
                    log.warn(
                      `Token refresh ${result.errorCode} (attempt ${
                        attempt + 1
                      }/${REFRESH_MAX_RETRIES}): ${result.error}`,
                    );
                    lastError = new Error(
                      result.error || "Token refresh failed",
                    );
                    continue; // Retry
                  }

                  // Auth error or unknown - logout
                  log.error(
                    `Token refresh failed with ${result.errorCode}: ${result.error}`,
                  );
                  get().logout();
                  throw new Error(result.error || "Token refresh failed");
                }

                const tokenResponse = result.data;
                const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

                const storedTokens: StoredTokens = {
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt,
                  cloudRegion: state.cloudRegion,
                  scopeVersion: state.storedTokens?.scopeVersion ?? 0,
                };

                const apiHost = getCloudUrlFromRegion(state.cloudRegion);
                const projectId = state.projectId ?? undefined;

                const client = new PostHogAPIClient(
                  tokenResponse.access_token,
                  apiHost,
                  async () => {
                    await get().refreshAccessToken();
                    const token = get().oauthAccessToken;
                    if (!token) {
                      throw new Error("No access token after refresh");
                    }
                    return token;
                  },
                  projectId,
                );

                set({
                  oauthAccessToken: tokenResponse.access_token,
                  oauthRefreshToken: tokenResponse.refresh_token,
                  tokenExpiry: expiresAt,
                  storedTokens,
                  client,
                  ...(projectId && { projectId }),
                });

                updateServiceTokens(tokenResponse.access_token);

                get().scheduleTokenRefresh();
                return; // Success
              } catch (error) {
                lastError =
                  error instanceof Error ? error : new Error(String(error));

                // Check if this is a permanent failure (logout already called)
                if (!get().oauthRefreshToken) {
                  throw lastError;
                }

                // tRPC exceptions are typically IPC failures - retry them
                log.warn(
                  `Token refresh exception (attempt ${attempt + 1}): ${
                    lastError.message
                  }`,
                );
              }
            }

            // All retries exhausted
            log.error(
              `Token refresh failed after all retries: ${
                lastError?.message || "Unknown error"
              }`,
            );
            get().logout();
            throw lastError || new Error("Token refresh failed");
          };

          refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
          });

          return refreshPromise;
        },

        scheduleTokenRefresh: () => {
          const state = get();

          if (refreshTimeoutId) {
            window.clearTimeout(refreshTimeoutId);
            refreshTimeoutId = null;
          }

          if (!state.tokenExpiry) {
            return;
          }

          const timeUntilRefresh =
            state.tokenExpiry - Date.now() - TOKEN_REFRESH_BUFFER_MS;

          if (timeUntilRefresh > 0) {
            refreshTimeoutId = window.setTimeout(() => {
              attemptRefreshWithActivityCheck(get).catch((error) => {
                log.error("Proactive token refresh failed:", error);
              });
            }, timeUntilRefresh);
          } else {
            attemptRefreshWithActivityCheck(get).catch((error) => {
              log.error("Immediate token refresh failed:", error);
            });
          }
        },

        initializeOAuth: async () => {
          // If initialization is already in progress, wait for it
          if (initializePromise) {
            log.debug("OAuth initialization already in progress, waiting...");
            return initializePromise;
          }

          const doInitialize = async (): Promise<boolean> => {
            // Wait for zustand hydration from async storage
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
              const now = Date.now();
              const isExpired = tokens.expiresAt <= now;

              set({
                oauthAccessToken: tokens.accessToken,
                oauthRefreshToken: tokens.refreshToken,
                tokenExpiry: tokens.expiresAt,
                cloudRegion: tokens.cloudRegion,
              });

              if (isExpired) {
                try {
                  await get().refreshAccessToken();
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

              // Re-fetch tokens after potential refresh to get updated values
              const currentTokens = get().storedTokens;
              if (!currentTokens) {
                return false;
              }

              const apiHost = getCloudUrlFromRegion(currentTokens.cloudRegion);
              const storedProjectId = get().projectId;

              const client = new PostHogAPIClient(
                currentTokens.accessToken,
                apiHost,
                async () => {
                  await get().refreshAccessToken();
                  const token = get().oauthAccessToken;
                  if (!token) {
                    throw new Error("No access token after refresh");
                  }
                  return token;
                },
                storedProjectId ?? undefined,
              );

              try {
                const user = await client.getCurrentUser();
                const orgProjectsMap = await buildOrgProjectsMap(user, client);

                const userCurrentTeam = user?.team?.id;
                const selectedProjectId = storedProjectId ?? userCurrentTeam;

                client.setTeamId(selectedProjectId);

                set({
                  isAuthenticated: true,
                  client,
                  projectId: selectedProjectId,
                  orgProjectsMap,
                  needsProjectSelection: false,
                });

                queryClient.setQueryData(["currentUser"], user);

                updateServiceTokens(currentTokens.accessToken);

                get().scheduleTokenRefresh();

                // Use distinct_id to match web sessions (same as PostHog web app)
                const distinctId = user.distinct_id || user.email;
                identifyUser(distinctId, {
                  email: user.email,
                  uuid: user.uuid,
                  project_id: selectedProjectId?.toString(),
                  region: tokens.cloudRegion,
                });

                trpcClient.analytics.setUserId.mutate({
                  userId: distinctId,
                  properties: {
                    email: user.email,
                    uuid: user.uuid,
                    project_id: selectedProjectId?.toString(),
                    region: tokens.cloudRegion,
                  },
                });

                get().checkCodeAccess();

                return true;
              } catch (error) {
                log.error("Failed to validate OAuth session:", error);

                // Network errors from fetch are TypeError, wrapped by fetcher.ts as cause
                const isNetworkError =
                  error instanceof Error && error.cause instanceof TypeError;

                if (isNetworkError) {
                  log.warn(
                    "Network error during session validation - keeping session active",
                  );
                  set({
                    isAuthenticated: true,
                    client,
                    projectId: storedProjectId,
                    needsProjectSelection: false,
                  });
                  get().scheduleTokenRefresh();
                  return true;
                }

                // For auth errors (401/403) or unknown errors, clear the session
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
          const storedTokens: StoredTokens = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
            cloudRegion: region,
            scopeVersion: OAUTH_SCOPE_VERSION,
          };

          const apiHost = getCloudUrlFromRegion(region);

          const client = new PostHogAPIClient(
            tokenResponse.access_token,
            apiHost,
            async () => {
              await get().refreshAccessToken();
              const token = get().oauthAccessToken;
              if (!token) {
                throw new Error("No access token after refresh");
              }
              return token;
            },
          );

          try {
            const user = await client.getCurrentUser();
            const orgProjectsMap = await buildOrgProjectsMap(user, client);

            const selectedProjectId = user?.team?.id;

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
              orgProjectsMap,
              needsProjectSelection: false,
              needsScopeReauth: false,
            });

            updateServiceTokens(tokenResponse.access_token);

            queryClient.clear();
            queryClient.setQueryData(["currentUser"], user);

            get().scheduleTokenRefresh();

            const distinctId = user.distinct_id || user.email;
            identifyUser(distinctId, {
              email: user.email,
              uuid: user.uuid,
              project_id: selectedProjectId?.toString(),
              region,
            });
            track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
              project_id: selectedProjectId?.toString(),
              region,
            });

            trpcClient.analytics.setUserId.mutate({
              userId: distinctId,
              properties: {
                email: user.email,
                uuid: user.uuid,
                project_id: selectedProjectId?.toString(),
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

          const allProjectIds = Object.values(state.orgProjectsMap).flatMap(
            (o) => o.projects.map((p) => p.id),
          );
          if (!allProjectIds.includes(projectId)) {
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

          // Clean up all existing sessions before switching projects
          sessionResetCallback?.();

          const apiHost = getCloudUrlFromRegion(cloudRegion);

          // Create a new client with the selected project
          const client = new PostHogAPIClient(
            accessToken,
            apiHost,
            async () => {
              await get().refreshAccessToken();
              const token = get().oauthAccessToken;
              if (!token) {
                throw new Error("No access token after refresh");
              }
              return token;
            },
            projectId,
          );

          set({
            projectId,
            client,
            needsProjectSelection: false,
          });

          // Clear project-scoped queries, but keep project list/user for the switcher
          queryClient.removeQueries({
            predicate: (query) => {
              const key = Array.isArray(query.queryKey)
                ? query.queryKey[0]
                : query.queryKey;
              return key !== "currentUser";
            },
          });

          // Navigate to task input after project selection
          useNavigationStore.getState().navigateToTaskInput();

          // Update analytics with the selected project
          updateServiceTokens(accessToken);

          track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
            project_id: projectId.toString(),
            region: cloudRegion,
          });

          log.info("Project selected", { projectId });
        },

        switchOrg: async (orgId: string) => {
          const state = get();
          if (!state.client) {
            throw new Error("No client available");
          }

          await state.client.switchOrganization(orgId);
          const user = await state.client.getCurrentUser();
          const orgProjectsMap = await buildOrgProjectsMap(user, state.client);

          set({ orgProjectsMap });
          queryClient.setQueryData(["currentUser"], user);
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

          // Clean up session service subscriptions before clearing auth state
          sessionResetCallback?.();

          trpcClient.analytics.resetUser.mutate();

          if (refreshTimeoutId) {
            window.clearTimeout(refreshTimeoutId);
            refreshTimeoutId = null;
          }

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
            orgProjectsMap: {},
            needsProjectSelection: false,
            needsScopeReauth: false,
            hasCodeAccess: null,
            hasCompletedOnboarding: false,
            selectedPlan: null,
            selectedOrgId: null,
          });
        },
      }),
      {
        // TODO: Migrate to posthog-code
        name: "array-auth",
        storage: electronStorage,
        partialize: (state) => ({
          cloudRegion: state.cloudRegion,
          storedTokens: state.storedTokens,
          staleTokens: state.staleTokens,
          projectId: state.projectId,
          orgProjectsMap: state.orgProjectsMap,
          hasCodeAccess: state.hasCodeAccess,
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          selectedPlan: state.selectedPlan,
          selectedOrgId: state.selectedOrgId,
        }),
      },
    ),
  ),
);
