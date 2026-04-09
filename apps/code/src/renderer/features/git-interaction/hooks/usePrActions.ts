import {
  getOptimisticPrState,
  PR_ACTION_LABELS,
} from "@features/git-interaction/utils/prStatus";
import type { PrActionType } from "@main/services/git/schemas";
import { useTRPC } from "@renderer/trpc";
import { toast } from "@renderer/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function usePrActions(prUrl: string | null) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.git.updatePrByUrl.mutationOptions({
      onSuccess: (data, variables) => {
        if (data.success) {
          toast.success(PR_ACTION_LABELS[variables.action]);
          queryClient.setQueryData(
            trpc.git.getPrDetailsByUrl.queryKey({ prUrl: variables.prUrl }),
            getOptimisticPrState(variables.action),
          );
        } else {
          toast.error("Failed to update PR", { description: data.message });
        }
      },
      onError: (error) => {
        toast.error("Failed to update PR", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      },
    }),
  );

  return {
    execute: (action: PrActionType) => {
      if (!prUrl) return;
      mutation.mutate({ prUrl, action });
    },
    isPending: mutation.isPending,
  };
}
