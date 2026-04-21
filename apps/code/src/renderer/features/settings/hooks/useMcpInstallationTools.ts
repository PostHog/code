import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type {
  McpApprovalState,
  McpInstallationTool,
} from "@renderer/api/posthogClient";
import { useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { dispatchBulkApproval } from "./mcpToolBulk";
import { mcpKeys } from "./useMcpServers";

interface UseMcpInstallationToolsOptions {
  includeRemoved?: boolean;
}

export function useMcpInstallationTools(
  installationId: string | null,
  options: UseMcpInstallationToolsOptions = {},
) {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();

  const queryKey = [
    ...mcpKeys.tools(installationId ?? ""),
    { includeRemoved: !!options.includeRemoved },
  ] as const;

  const { data: tools, isLoading } = useAuthenticatedQuery(
    queryKey,
    (client) =>
      installationId
        ? client.getMcpInstallationTools(installationId, {
            includeRemoved: options.includeRemoved,
          })
        : Promise.resolve([] as McpInstallationTool[]),
    { enabled: !!installationId },
  );

  const invalidate = useCallback(() => {
    if (!installationId) return;
    queryClient.invalidateQueries({
      queryKey: mcpKeys.tools(installationId),
    });
  }, [installationId, queryClient]);

  const setToolApprovalMutation = useAuthenticatedMutation(
    (client, vars: { toolName: string; approval_state: McpApprovalState }) => {
      if (!installationId) {
        return Promise.reject(new Error("No installation selected"));
      }
      return client.updateMcpToolApproval(
        installationId,
        vars.toolName,
        vars.approval_state,
      );
    },
    {
      onSuccess: () => {
        invalidate();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to update tool approval");
      },
    },
  );

  const setBulkApprovalMutation = useAuthenticatedMutation(
    (client, approval_state: McpApprovalState) => {
      if (!installationId) {
        return Promise.reject(new Error("No installation selected"));
      }
      return dispatchBulkApproval(
        client,
        installationId,
        tools ?? [],
        approval_state,
      );
    },
    {
      onSuccess: () => {
        invalidate();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to update tool approvals");
      },
    },
  );

  const refreshMutation = useAuthenticatedMutation(
    (client) => {
      if (!installationId) {
        return Promise.reject(new Error("No installation selected"));
      }
      return client.refreshMcpInstallationTools(installationId);
    },
    {
      onSuccess: () => {
        toast.success("Tools refreshed");
        invalidate();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to refresh tools");
      },
    },
  );

  useSubscription(
    trpcReact.mcpCallback.onOAuthComplete.subscriptionOptions(undefined, {
      onData: (data) => {
        if (data.status === "success") {
          invalidate();
        }
      },
    }),
  );

  return {
    tools: tools ?? [],
    isLoading,
    setToolApproval: setToolApprovalMutation.mutate,
    setBulkApproval: setBulkApprovalMutation.mutate,
    bulkPending: setBulkApprovalMutation.isPending,
    refresh: () => refreshMutation.mutate(undefined),
    refreshPending: refreshMutation.isPending,
  };
}
