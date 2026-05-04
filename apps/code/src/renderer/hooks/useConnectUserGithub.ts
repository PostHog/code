import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { trpcClient } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseConnectUserGithubResult {
  connect: () => Promise<void>;
  isConnecting: boolean;
  canConnect: boolean;
}

/**
 * Starts the GitHub user-integration install flow and refreshes the relevant
 * query caches once the user returns to the window. Shared between the inbox
 * banner and the cloud-task fallback notice; onboarding has its own polling
 * state machine and uses the underlying API directly.
 */
export function useConnectUserGithub(): UseConnectUserGithubResult {
  const apiClient = useOptionalAuthenticatedClient();
  const projectId = useAuthStateValue((s) => s.projectId);
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);
  const queryClient = useQueryClient();

  const [isConnecting, setIsConnecting] = useState(false);
  const awaitingLink = useRef(false);
  const inFlight = useRef(false);

  const canConnect =
    apiClient != null && projectId != null && cloudRegion != null;

  useEffect(() => {
    const onFocus = () => {
      if (!awaitingLink.current) return;
      awaitingLink.current = false;
      void queryClient.invalidateQueries({ queryKey: ["github_login"] });
      void queryClient.invalidateQueries({
        queryKey: ["integrations", "list"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["user-github-integrations"],
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  const connect = useCallback(async () => {
    if (!canConnect || inFlight.current || !apiClient || !projectId) return;
    inFlight.current = true;
    awaitingLink.current = true;
    setIsConnecting(true);
    try {
      const res = await apiClient.startGithubUserIntegrationConnect(projectId);
      const installUrl = res.install_url?.trim() ?? "";
      if (!installUrl) {
        awaitingLink.current = false;
        toast.error(
          "GitHub connection did not return a URL. Please try again.",
        );
        return;
      }
      await trpcClient.os.openExternal.mutate({ url: installUrl });
    } catch (error) {
      awaitingLink.current = false;
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start GitHub connection",
      );
    } finally {
      inFlight.current = false;
      setIsConnecting(false);
    }
  }, [apiClient, canConnect, projectId]);

  return { connect, isConnecting, canConnect };
}
