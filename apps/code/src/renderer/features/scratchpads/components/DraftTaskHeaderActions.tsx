import { PublishDialog } from "@features/scratchpads/components/PublishDialog";
import { useDraftTaskIds } from "@features/scratchpads/hooks/useDraftTaskInfo";
import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@radix-ui/themes";
import { trpc } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface DraftTaskHeaderActionsProps {
  taskId: string;
}

/**
 * Surfaces the Publish button when the active task is a draft scratchpad.
 * Renders nothing if the task isn't a draft.
 */
export function DraftTaskHeaderActions({
  taskId,
}: DraftTaskHeaderActionsProps) {
  const draftTaskIds = useDraftTaskIds();
  const isDraft = draftTaskIds.has(taskId);

  const posthogClient = useAuthenticatedClient();

  const manifestQuery = useQuery(
    trpc.scratchpad.readManifest.queryOptions(
      { taskId },
      {
        enabled: isDraft,
        staleTime: 30_000,
      },
    ),
  );

  const projectId = manifestQuery.data?.projectId;
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => {
      if (projectId === undefined) return null;
      return posthogClient.getProject(projectId).catch(() => null);
    },
    enabled: isDraft && projectId !== undefined,
    staleTime: 60_000,
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isDraft) return null;

  const productName = projectQuery.data?.name ?? "";

  return (
    <>
      <Button
        size="1"
        variant="soft"
        color="green"
        onClick={() => setDialogOpen(true)}
        disabled={!productName}
      >
        <UploadSimpleIcon size={12} weight="bold" />
        Publish
      </Button>
      {dialogOpen && (
        <PublishDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          taskId={taskId}
          defaultRepoName={productName}
          productName={productName}
        />
      )}
    </>
  );
}
