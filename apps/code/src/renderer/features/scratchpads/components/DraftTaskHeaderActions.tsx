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
  const hasLinkedProject = projectId != null;
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => {
      if (!hasLinkedProject) return null;
      return posthogClient.getProject(projectId).catch(() => null);
    },
    enabled: isDraft && hasLinkedProject,
    staleTime: 60_000,
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isDraft) return null;

  // When no project is linked we still render the Publish button so the user
  // can see the path forward — the dialog/hook will explain that linking a
  // project is a prerequisite.
  const productName = hasLinkedProject
    ? (projectQuery.data?.name ?? "")
    : manifestQuery.data
      ? ""
      : "";
  const repoNameDefault = productName;

  return (
    <>
      <Button
        size="1"
        variant="soft"
        color="green"
        onClick={() => setDialogOpen(true)}
        disabled={hasLinkedProject && !productName}
      >
        <UploadSimpleIcon size={12} weight="bold" />
        Publish
      </Button>
      {dialogOpen && (
        <PublishDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          taskId={taskId}
          defaultRepoName={repoNameDefault}
          productName={productName}
        />
      )}
    </>
  );
}
