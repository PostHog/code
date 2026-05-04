import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useGitHubIntegrationCallback } from "@features/integrations/hooks/useGitHubIntegrationCallback";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;

export type GithubUserConnectState = "idle" | "connecting" | "timed-out";

interface Options {
  projectId: number | null;
}

interface Result {
  state: GithubUserConnectState;
  connect: () => Promise<void>;
  reset: () => void;
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
    (pid: number | null) => {
      if (pid !== null) {
        void queryClient.invalidateQueries({
          queryKey: ["integrations", pid],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["integrations", "list"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["user-github-integrations"],
      });
      void queryClient.invalidateQueries({ queryKey: ["github_login"] });
    },
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
      invalidate(callbackProjectId ?? projectId);
    },
    onError: (message) => {
      stopPolling();
      setState("idle");
      toast.error(message);
    },
    onTimedOut: () => {
      stopPolling();
      setState("timed-out");
      invalidate(projectId);
    },
  });

  const connect = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    if (!cloudRegion || projectId === null || !client) return;
    stopPolling();
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
    } catch (error) {
      setState("idle");
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start GitHub connection",
      );
    }
  }, [client, cloudRegion, projectId, invalidate, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setState("idle");
  }, [stopPolling]);

  return { state, connect, reset };
}
