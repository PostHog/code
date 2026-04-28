import { PublishDialog } from "@features/scratchpads/components/PublishDialog";
import { useDraftTaskIds } from "@features/scratchpads/hooks/useDraftTaskInfo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@radix-ui/themes";
import { useState } from "react";

interface DraftTaskHeaderActionsProps {
  taskId: string;
  taskTitle: string;
}

/**
 * Surfaces the Publish button when the active task is a draft scratchpad.
 * Renders nothing if the task isn't a draft.
 */
export function DraftTaskHeaderActions({
  taskId,
  taskTitle,
}: DraftTaskHeaderActionsProps) {
  const draftTaskIds = useDraftTaskIds();
  const isDraft = draftTaskIds.has(taskId);

  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isDraft) return null;

  return (
    <>
      <Button
        size="1"
        variant="soft"
        color="green"
        onClick={() => setDialogOpen(true)}
      >
        <UploadSimpleIcon size={12} weight="bold" />
        Publish
      </Button>
      {dialogOpen && (
        <PublishDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          taskId={taskId}
          defaultRepoName={taskTitle}
          productName={taskTitle}
        />
      )}
    </>
  );
}
