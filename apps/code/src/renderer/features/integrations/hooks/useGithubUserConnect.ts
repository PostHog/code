import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useGitHubIntegrationCallback } from "@features/integrations/hooks/useGitHubIntegrationCallback";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;

export type GithubUserConnectState =
  | "idle"
  | "connecting"
  | "timed-out"
  | "error";

export interface GithubUserConnectError {
  message: string;
  code: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "You declined access on GitHub. Try again to grant the permissions PostHog Code needs.",
  github_oauth_error: "GitHub returned an error during sign-in. Please retry.",
  missing_params: "GitHub returned an incomplete response. Please retry.",
  invalid_state:
    "The connection link expired before you finished. Please retry.",
  invalid_installation:
    "This GitHub installation isn't reachable from your account. Try a different account or org.",
  invalid_team:
    "Your project access changed during sign-in. Please retry from the current project.",
  invalid_installation_id:
    "GitHub returned an invalid installation. Please retry.",
  exchange_failed:
    "Couldn't exchange the GitHub authorization code. Please retry.",
  installation_verify_failed:
    "Couldn't verify your access to this GitHub installation. Please retry.",
  installation_not_authorized:
    "Your GitHub account isn't authorized for this installation. Ask the org admin to grant access, or sign in with a different GitHub account.",
  installation_fetch_failed:
    "Couldn't fetch installation details from GitHub. Please retry.",
  installation_token_failed:
    "Couldn't get an access token from GitHub. Please retry.",
  integration_create_failed:
    "Couldn't save the GitHub connection. Please retry.",
};

export function describeGithubConnectError(
  error: GithubUserConnectError | null,
): string {
  if (!error) return "";
  if (error.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }
  return error.message;
}

interface Options {
  projectId: number | null;
}

interface Result {
  state: GithubUserConnectState;
  error: GithubUserConnectError | null;
  connect: () => Promise<void>;
  reset: () => void;
}

export function invalidateGithubQueries(
  queryClient: QueryClient,
  projectId: number | null = null,
): void {
  if (projectId !== null) {
    void queryClient.invalidateQueries({
      queryKey: ["integrations", projectId],
    });
  }
  void queryClient.invalidateQueries({
    queryKey: ["integrations", "list"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["user-github-integrations"],
  });
  void queryClient.invalidateQueries({ queryKey: ["github_login"] });
}

async function openUrlInBrowser(url: string): Promise<void> {
  try {
    await trpcClient.os.openExternal.mutate({ url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function useGithubUserConnect({ projectId }: Options): Result {
  const client = useOptionalAuthenticatedClient();
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);
  const queryClient = useQueryClient();
  const [state, setState] = useState<GithubUserConnectState>("idle");
  const [error, setError] = useState<GithubUserConnectError | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const invalidate = useCallback(
    (pid: number | null) => invalidateGithubQueries(queryClient, pid),
    [queryClient],
  );

  useEffect(() => stopPolling, [stopPolling]);

  // Window-focus fallback: deep link from PostHog Cloud may not fire reliably,
  // so refetch when the user returns to the app while a connect is in flight.
  useEffect(() => {
    if (state !== "connecting") return;
    const onFocus = () => invalidate(projectId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [state, projectId, invalidate]);

  useGitHubIntegrationCallback({
    onSuccess: (callbackProjectId) => {
      stopPolling();
      setState("idle");
      setError(null);
      invalidate(callbackProjectId ?? projectId);
    },
    onError: (cbError) => {
      stopPolling();
      setState("error");
      setError(cbError);
    },
    onTimedOut: () => {
      stopPolling();
      setState("timed-out");
      invalidate(projectId);
    },
  });

  const connect = useCallback(async () => {
    if (stateRef.current === "connecting") return;
    if (!cloudRegion || projectId === null || !client) return;
    stopPolling();
    setError(null);
    setState("connecting");
    try {
      const res = await client.startGithubUserIntegrationConnect(projectId);
      const installUrl = res.install_url?.trim() ?? "";
      if (!installUrl) {
        throw new Error("GitHub connection did not return a URL");
      }
      await openUrlInBrowser(installUrl);

      if (IS_DEV) {
        pollTimerRef.current = setInterval(
          () => invalidate(projectId),
          POLL_INTERVAL_MS,
        );
      }

      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        setState("timed-out");
      }, POLL_TIMEOUT_MS);
    } catch (e) {
      setState("error");
      setError({
        message:
          e instanceof Error ? e.message : "Failed to start GitHub connection",
        code: null,
      });
    }
  }, [client, cloudRegion, projectId, invalidate, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setError(null);
    setState("idle");
  }, [stopPolling]);

  return { state, error, connect, reset };
}
