import { useSeatStore } from "@features/billing/stores/seatStore";
import { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import type { CloudRegion } from "@shared/types/regions";
import { useNavigationStore } from "@stores/navigationStore";
import { identifyUser, resetUser, track } from "@utils/analytics";
import { logger } from "@utils/logger";
import { queryClient } from "@utils/queryClient";
import { create } from "zustand";

const log = logger.scope("auth-store");

let initializePromise: Promise<boolean> | null = null;
let authStateSubscription: { unsubscribe: () => void } | null = null;
let sessionResetCallback: (() => void) | null = null;
let inFlightAuthSync: Promise<void> | null = null;
let inFlightAuthSyncKey: string | null = null;
let lastCompletedAuthSyncKey: string | null = null;

export function setSessionResetCallback(callback: () => void) {
  sessionResetCallback = callback;
}

export function resetAuthStoreModuleStateForTest(): void {
  initializePromise = null;
  authStateSubscription = null;
  sessionResetCallback = null;
  inFlightAuthSync = null;
  inFlightAuthSyncKey = null;
  lastCompletedAuthSyncKey = null;
}

interface AuthStoreState {
  cloudRegion: CloudRegion | null;
  staleCloudRegion: CloudRegion | null;
  isAuthenticated: boolean;
  client: PostHogAPIClient | null;
  projectId: number | null;
  availableProjectIds: number[];
  availableOrgIds: string[];
  needsProjectSelection: boolean;
  needsScopeReauth: boolean;
  hasCodeAccess: boolean | null;
  hasCompletedOnboarding: boolean;
  selectedPlan: "free" | "pro" | null;
  selectedOrgId: string | null;
  checkCodeAccess: () => Promise<void>;
  redeemInviteCode: (code: string) => Promise<void>;
  loginWithOAuth: (region: CloudRegion) => Promise<void>;
  signupWithOAuth: (region: CloudRegion) => Promise<void>;
  initializeOAuth: () => Promise<boolean>;
  selectProject: (projectId: number) => Promise<void>;
  completeOnboarding: () => void;
  selectPlan: (plan: "free" | "pro") => void;
  selectOrg: (orgId: string) => void;
  logout: () => Promise<void>;
}

async function getValidAccessToken(): Promise<string> {
  const { accessToken } = await trpcClient.auth.getValidAccessToken.query();
  return accessToken;
}

async function refreshAccessToken(): Promise<string> {
  const { accessToken } = await trpcClient.auth.refreshAccessToken.mutate();
  return accessToken;
}

function createClient(
  cloudRegion: CloudRegion,
  projectId: number | null,
): PostHogAPIClient {
  const client = new PostHogAPIClient(
    getCloudUrlFromRegion(cloudRegion),
    getValidAccessToken,
    refreshAccessToken,
    projectId ?? undefined,
  );
  if (projectId) {
    client.setTeamId(projectId);
  }
  return client;
}

function clearAuthenticatedRendererState(options?: {
  clearAllQueries?: boolean;
}): void {
  resetUser();
  trpcClient.analytics.resetUser.mutate();

  if (options?.clearAllQueries) {
    queryClient.clear();
    return;
  }

  queryClient.removeQueries({ queryKey: ["currentUser"], exact: true });
}

async function syncAuthState(): Promise<void> {
  const previousState = useAuthStore.getState();
  const authState = await trpcClient.auth.getState.query();
  const isAuthenticated = authState.status === "authenticated";

  useAuthStore.setState((state) => {
    const regionChanged = authState.cloudRegion !== state.cloudRegion;
    const projectChanged = authState.projectId !== state.projectId;
    const client =
      isAuthenticated && authState.cloudRegion
        ? regionChanged || projectChanged || !state.client
          ? createClient(authState.cloudRegion, authState.projectId)
          : state.client
        : null;

    return {
      ...state,
      isAuthenticated,
      cloudRegion: authState.cloudRegion,
      staleCloudRegion: isAuthenticated
        ? null
        : (authState.cloudRegion ?? state.staleCloudRegion),
      client,
      projectId: authState.projectId,
      availableProjectIds: authState.availableProjectIds,
      availableOrgIds: authState.availableOrgIds,
      needsProjectSelection:
        isAuthenticated &&
        authState.availableProjectIds.length > 1 &&
        authState.projectId === null,
      needsScopeReauth: authState.needsScopeReauth,
      hasCodeAccess: authState.hasCodeAccess,
    };
  });

  const client = useAuthStore.getState().client;

  if (!isAuthenticated || !authState.cloudRegion || !client) {
    if (previousState.isAuthenticated || lastCompletedAuthSyncKey !== null) {
      clearAuthenticatedRendererState();
    }
    inFlightAuthSync = null;
    inFlightAuthSyncKey = null;
    lastCompletedAuthSyncKey = null;
    return;
  }

  const authSyncKey = JSON.stringify({
    status: authState.status,
    cloudRegion: authState.cloudRegion,
    projectId: authState.projectId,
  });

  if (authSyncKey === lastCompletedAuthSyncKey) {
    return;
  }

  if (inFlightAuthSync && inFlightAuthSyncKey === authSyncKey) {
    await inFlightAuthSync;
    return;
  }

  inFlightAuthSyncKey = authSyncKey;
  inFlightAuthSync = (async () => {
    try {
      const user = await client.getCurrentUser();
      queryClient.setQueryData(["currentUser"], user);

      const distinctId = user.distinct_id || user.email;
      identifyUser(distinctId, {
        email: user.email,
        uuid: user.uuid,
        project_id: authState.projectId?.toString() ?? "",
        region: authState.cloudRegion ?? "",
      });

      trpcClient.analytics.setUserId.mutate({
        userId: distinctId,
        properties: {
          email: user.email,
          uuid: user.uuid,
          project_id: authState.projectId?.toString() ?? "",
          region: authState.cloudRegion ?? "",
        },
      });

      lastCompletedAuthSyncKey = authSyncKey;
    } catch (error) {
      log.warn("Failed to synchronize authenticated renderer state", { error });
    } finally {
      if (inFlightAuthSyncKey === authSyncKey) {
        inFlightAuthSync = null;
        inFlightAuthSyncKey = null;
      }
    }
  })();

  await inFlightAuthSync;
}

function ensureAuthSubscription(): void {
  if (authStateSubscription) {
    return;
  }

  authStateSubscription = trpcClient.auth.onStateChanged.subscribe(undefined, {
    onData: () => {
      void syncAuthState();
    },
    onError: (error) => {
      log.error("Auth state subscription error", { error });
    },
  });
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  cloudRegion: null,
  staleCloudRegion: null,

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

  checkCodeAccess: async () => {
    await syncAuthState();
  },

  redeemInviteCode: async (code: string) => {
    await trpcClient.auth.redeemInviteCode.mutate({ code });
    await syncAuthState();
  },

  loginWithOAuth: async (region: CloudRegion) => {
    const result = await trpcClient.auth.login.mutate({ region });
    await syncAuthState();
    track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
      project_id: result.state.projectId?.toString() ?? "",
      region,
    });
  },

  signupWithOAuth: async (region: CloudRegion) => {
    const result = await trpcClient.auth.signup.mutate({ region });
    await syncAuthState();
    track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
      project_id: result.state.projectId?.toString() ?? "",
      region,
    });
  },

  initializeOAuth: async () => {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      ensureAuthSubscription();
      await syncAuthState();
      return get().isAuthenticated || get().needsScopeReauth;
    })().finally(() => {
      initializePromise = null;
    });

    return initializePromise;
  },

  selectProject: async (projectId: number) => {
    sessionResetCallback?.();
    await trpcClient.auth.selectProject.mutate({ projectId });
    await syncAuthState();
    useNavigationStore.getState().navigateToTaskInput();
  },

  completeOnboarding: () => {
    set({ hasCompletedOnboarding: true });
    if (!useSeatStore.getState().seat) {
      useSeatStore.getState().provisionFreeSeat();
    }
  },

  selectPlan: (plan: "free" | "pro") => {
    set({ selectedPlan: plan });
  },

  selectOrg: (orgId: string) => {
    set({ selectedOrgId: orgId });
  },

  logout: async () => {
    track(ANALYTICS_EVENTS.USER_LOGGED_OUT);
    sessionResetCallback?.();
    useSeatStore.getState().reset();
    clearAuthenticatedRendererState({ clearAllQueries: true });
    await trpcClient.auth.logout.mutate();
    useNavigationStore.getState().navigateToTaskInput();

    set((state) => ({
      ...state,
      cloudRegion: null,
      staleCloudRegion: state.cloudRegion ?? null,
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
    }));
    inFlightAuthSync = null;
    inFlightAuthSyncKey = null;
    lastCompletedAuthSyncKey = null;
  },
}));
