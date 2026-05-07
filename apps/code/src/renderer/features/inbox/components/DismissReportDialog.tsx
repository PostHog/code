import { Button } from "@components/ui/Button";
import {
  ExplainedPauseLabel,
  ExplainedSuppressLabel,
} from "@features/inbox/components/utils/ExplainedDismissOptionLabels";
import { Dialog, Flex, RadioGroup, Text, TextArea } from "@radix-ui/themes";
import {
  DISMISSAL_REASON_OPTIONS,
  type DismissalReasonOptionValue,
} from "@shared/dismissalReasons";
import type { SignalReport } from "@shared/types";
import { useEffect, useState } from "react";

export interface DismissReportDialogResult {
  reason: DismissalReasonOptionValue;
  note: string;
}

export interface DismissReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: SignalReport;
  isSubmitting: boolean;
  /**
   * When snooze is not allowed for the current selection, the "Already fixed elsewhere"
   * option is disabled because that path snoozes instead of dismissing.
   */
  snoozeDisabledReason: string | null;
  onConfirm: (result: DismissReportDialogResult) => void;
}

export function DismissReportDialog({
  open,
  onOpenChange,
  report,
  isSubmitting,
  snoozeDisabledReason,
  onConfirm,
}: DismissReportDialogProps) {
  const [reason, setReason] = useState<DismissalReasonOptionValue | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm({ reason, note: note.trim() });
  };

  const alreadyFixedDisabled = snoozeDisabledReason !== null;

  const title = report.title?.trim() ? report.title : "Untitled signal";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="480px" size="1">
        <Flex direction="column" gap="2">
          <Text className="text-balance font-medium text-sm leading-tight">
            Dismiss report "{title}"?
          </Text>

          <Text color="gray" className="mb-1 text-[13px]">
            This report will be removed from your inbox.
            <br />
            Your feedback is saved on the report and helps the agents do better.
          </Text>

          <RadioGroup.Root
            size="1"
            value={reason ?? ""}
            onValueChange={(value) =>
              setReason(value as DismissalReasonOptionValue)
            }
          >
            <Flex direction="column" gap="2">
              {DISMISSAL_REASON_OPTIONS.map((option) => {
                const snoozesInsteadOfDismiss =
                  "snoozesInsteadOfDismiss" in option &&
                  option.snoozesInsteadOfDismiss === true;
                const disabled =
                  snoozesInsteadOfDismiss && alreadyFixedDisabled;

                return snoozesInsteadOfDismiss ? (
                  <ExplainedPauseLabel
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    disabled={disabled}
                    disabledReason={disabled ? snoozeDisabledReason : undefined}
                  />
                ) : (
                  <ExplainedSuppressLabel
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  />
                );
              })}
            </Flex>
          </RadioGroup.Root>

          <TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional: add detail"
            size="1"
            rows={3}
            maxLength={4000}
            disabled={isSubmitting}
          />

          <Flex gap="2" justify="end">
            <Dialog.Close>
              <Button size="1" variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              size="1"
              variant="solid"
              color="gray"
              disabled={!reason || isSubmitting}
              disabledReason={!reason ? "you haven't picked a reason" : null}
              onClick={handleConfirm}
              loading={isSubmitting}
            >
              Dismiss & teach the agent
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
