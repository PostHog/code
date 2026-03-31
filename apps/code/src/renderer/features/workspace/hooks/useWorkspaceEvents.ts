import { trpcClient } from "@renderer/trpc/client";
import { toast } from "@utils/toast";
import { useEffect } from "react";

export function useWorkspaceEvents(taskId: string) {
  useEffect(() => {
    const warningSubscription = trpcClient.workspace.onWarning.subscribe(
      undefined,
      {
        onData: (data) => {
          if (data.taskId !== taskId) return;
          toast.warning(data.title, {
            description: data.message,
            duration: 10000,
          });
        },
      },
    );

    return () => {
      warningSubscription.unsubscribe();
    };
  }, [taskId]);
}
