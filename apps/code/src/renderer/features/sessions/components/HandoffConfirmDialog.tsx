import { GitDialog } from "@features/git-interaction/components/GitInteractionDialogs";
import { ArrowLineDown, Cloud } from "@phosphor-icons/react";
import { Code, Text } from "@radix-ui/themes";

interface HandoffConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "to-local" | "to-cloud";
  branchName: string | null;
  onConfirm: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function HandoffConfirmDialog({
  open,
  onOpenChange,
  direction,
  branchName,
  onConfirm,
  isSubmitting,
  error,
}: HandoffConfirmDialogProps) {
  const isToLocal = direction === "to-local";

  return (
    <GitDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={isToLocal ? <ArrowLineDown size={14} /> : <Cloud size={14} />}
      title={isToLocal ? "Continue locally" : "Continue in cloud"}
      error={error}
      buttonLabel="Continue"
      isSubmitting={isSubmitting}
      onSubmit={onConfirm}
    >
      <Text size="1" color="gray">
        {isToLocal ? (
          <>
            This will bring your changes from the cloud run into your local
            environment on branch{" "}
            <Code size="1">{branchName ?? "unknown"}</Code>.
          </>
        ) : (
          <>
            This will send your changes on branch{" "}
            <Code size="1">{branchName ?? "unknown"}</Code> to the cloud and
            continue running there.
          </>
        )}
      </Text>
    </GitDialog>
  );
}
