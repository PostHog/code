import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import {
  type AuthState,
  clearAuthScopedQueries,
  getAuthIdentity,
  refreshAuthStateQuery,
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
import { useAuthUiStateStore } from "@features/auth/stores/authUiStateStore";
import { trpcClient } from "@renderer/trpc/client";
import { identifyUser, resetUser } from "@utils/analytics";
import { logger } from "@utils/logger";
import { useEffect } from "react";

const log = logger.scope("auth-session");

function useAuthSubscriptionSync(): void {
  useEffect(() => {
    const subscription = trpcClient.auth.onStateChanged.subscribe(undefined, {
      onData: () => {
        void refreshAuthStateQuery();
      },
      onError: (error) => {
        log.error("Auth state subscription error", { error });
      },
    });

    return () => subscription.unsubscribe();
  }, []);
}

function useAuthIdentitySync(
  authIdentity: string | null,
  cloudRegion: "us" | "eu" | "dev" | null,
): void {
  useEffect(() => {
    if (!authIdentity) {
      resetUser();
      void trpcClient.analytics.resetUser.mutate();
      clearAuthScopedQueries();
      if (cloudRegion) {
        useAuthUiStateStore.getState().setStaleRegion(cloudRegion);
      }
      return;
    }

    useAuthUiStateStore.getState().clearStaleRegion();
  }, [authIdentity, cloudRegion]);
}

function useAuthAnalyticsIdentity(
  authIdentity: string | null,
  authState: AuthState,
  currentUser: ReturnType<typeof useCurrentUser>["data"],
): void {
  useEffect(() => {
    if (!authIdentity || !currentUser) {
      return;
    }

    const distinctId = currentUser.distinct_id || currentUser.email;

    identifyUser(distinctId, {
      email: currentUser.email,
      uuid: currentUser.uuid,
      project_id: authState.projectId?.toString() ?? "",
      region: authState.cloudRegion ?? "",
    });

    void trpcClient.analytics.setUserId.mutate({
      userId: distinctId,
      properties: {
        email: currentUser.email,
        uuid: currentUser.uuid,
        project_id: authState.projectId?.toString() ?? "",
        region: authState.cloudRegion ?? "",
      },
    });
  }, [authIdentity, authState.cloudRegion, authState.projectId, currentUser]);
}

export function useAuthSession() {
  const authState = useAuthStateValue((state) => state);
  const client = useOptionalAuthenticatedClient();
  const { data: currentUser } = useCurrentUser({ client });
  const authIdentity = getAuthIdentity(authState);

  useAuthSubscriptionSync();
  useAuthIdentitySync(authIdentity, authState.cloudRegion);
  useAuthAnalyticsIdentity(authIdentity, authState, currentUser);

  return {
    authState,
    isBootstrapped: authState.bootstrapComplete,
  };
}
