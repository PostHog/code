import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type {
  McpRecommendedServer,
  PostHogAPIClient,
} from "@renderer/api/posthogClient";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

const mcpKeys = {
  servers: ["mcp", "servers"] as const,
  installations: ["mcp", "installations"] as const,
};

/**
 * Install an MCP server with OAuth through the main process.
 * 1. Gets callback URL from main process (deep link or local HTTP server)
 * 2. Calls PostHog API with install_source="twig" + twig_callback_url
 * 3. If redirect_url returned, main process opens browser and waits for callback
 */
async function installWithOAuth(
  client: PostHogAPIClient,
  vars: {
    name: string;
    url: string;
    description: string;
    auth_type: "none" | "api_key" | "oauth";
    api_key?: string;
    oauth_provider_kind?: string;
  },
) {
  // Step 1: Get callback URL from main process
  const { callbackUrl } = await trpcClient.mcpCallback.getCallbackUrl.query();

  // Step 2: Call PostHog API with PostHog Code-specific params
  const data = await client.installCustomMcpServer({
    ...vars,
    install_source: "posthog-code",
    posthog_code_callback_url: callbackUrl,
  });

  // Step 3: If OAuth redirect needed, open browser via main process and wait
  if ("redirect_url" in data && data.redirect_url) {
    const result = await trpcClient.mcpCallback.openAndWaitForCallback.mutate({
      redirectUrl: data.redirect_url,
    });
    return result;
  }

  // Non-OAuth: return installation directly
  return { success: true };
}

export function useMcpServers() {
  const trpcReact = useTRPC();
  const [installingUrl, setInstallingUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const markSessionsForMcpRefresh = useCallback(() => {
    // MCP config changes are picked up on next session creation.
  }, []);

  const { data: installations, isLoading: installationsLoading } =
    useAuthenticatedQuery(mcpKeys.installations, (client) =>
      client.getMcpServerInstallations(),
    );

  const { data: servers, isLoading: serversLoading } = useAuthenticatedQuery(
    mcpKeys.servers,
    (client) => client.getMcpServers(),
  );

  const installedUrls = useMemo(
    () => new Set((installations ?? []).map((i) => i.url)),
    [installations],
  );

  const uninstallMutation = useAuthenticatedMutation(
    (client, installationId: string) =>
      client.uninstallMcpServer(installationId),
    {
      onSuccess: () => {
        toast.success("Server uninstalled");
        queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
        markSessionsForMcpRefresh();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to uninstall server");
      },
    },
  );

  const toggleEnabledMutation = useAuthenticatedMutation(
    (client, vars: { id: string; is_enabled: boolean }) =>
      client.updateMcpServerInstallation(vars.id, {
        is_enabled: vars.is_enabled,
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
        markSessionsForMcpRefresh();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to update server");
      },
    },
  );

  const toggleEnabled = useCallback(
    (installationId: string, enabled: boolean) => {
      toggleEnabledMutation.mutate({ id: installationId, is_enabled: enabled });
    },
    [toggleEnabledMutation],
  );

  const installRecommendedMutation = useAuthenticatedMutation(
    (
      client,
      vars: {
        name: string;
        url: string;
        description: string;
        auth_type: "none" | "api_key" | "oauth";
        oauth_provider_kind?: string;
      },
    ) => installWithOAuth(client, vars),
    {
      onSuccess: (data) => {
        if (data && "success" in data && data.success) {
          toast.success("Server connected");
          markSessionsForMcpRefresh();
        } else if (data && "error" in data && data.error) {
          toast.error(data.error);
        }
        queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
        setInstallingUrl(null);
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to connect server");
        setInstallingUrl(null);
      },
    },
  );

  const installRecommended = useCallback(
    (server: McpRecommendedServer) => {
      setInstallingUrl(server.url);
      installRecommendedMutation.mutate({
        name: server.name,
        url: server.url,
        description: server.description,
        auth_type: server.auth_type,
        ...(server.oauth_provider_kind
          ? { oauth_provider_kind: server.oauth_provider_kind }
          : {}),
      });
    },
    [installRecommendedMutation],
  );

  // Subscribe to MCP OAuth completion events for background refresh
  useSubscription(
    trpcReact.mcpCallback.onOAuthComplete.subscriptionOptions(undefined, {
      onData: (data) => {
        if (data.status === "success") {
          queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
          markSessionsForMcpRefresh();
        }
      },
    }),
  );

  return {
    installations,
    installationsLoading,
    servers,
    serversLoading,
    installedUrls,
    installingUrl,
    uninstallMutation,
    toggleEnabled,
    installRecommended,
    invalidateInstallations: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.installations });
      markSessionsForMcpRefresh();
    },
  };
}
