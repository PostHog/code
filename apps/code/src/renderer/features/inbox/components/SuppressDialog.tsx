import { Button } from "@components/ui/Button";
import { EyeSlashIcon } from "@phosphor-icons/react";
import {
  Dialog,
  Flex,
  RadioGroup,
  Spinner,
  Text,
  TextArea,
} from "@radix-ui/themes";
import type { DismissalReason } from "@shared/types";
import { useEffect, useState } from "react";

interface DismissalReasonOption {
  value: DismissalReason;
  label: string;
}

const DISMISSAL_REASON_OPTIONS: readonly DismissalReasonOption[] = [
  { value: "already_fixed", label: "Already fixed elsewhere" },
  { value: "analysis_wrong", label: "Agent's analysis is wrong" },
  { value: "wontfix_intentional", label: "Won't fix - intentional behavior" },
  {
    value: "wontfix_irrelevant",
    label: "Won't fix - issue is real but irrelevant",
  },
  { value: "wrong_reviewer", label: "I'm not the right reviewer" },
  { value: "other", label: "Other" },
] as const;

export interface SuppressDialogResult {
  reason: DismissalReason;
  note: string;
}

export interface SuppressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of reports being suppressed; controls heading wording. */
  reportCount: number;
  isSubmitting: boolean;
  onConfirm: (result: SuppressDialogResult) => void;
}

export function SuppressDialog({
  open,
  onOpenChange,
  reportCount,
  isSubmitting,
  onConfirm,
}: SuppressDialogProps) {
  const [reason, setReason] = useState<DismissalReason | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote("");
    }
  }, [open]);

  const isPlural = reportCount !== 1;
  const reportNoun = isPlural ? "reports" : "report";

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm({ reason, note: note.trim() });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="480px" size="1">
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <EyeSlashIcon size={16} />
            <Text className="font-medium text-sm">
              {isPlural ? `Suppress ${reportCount} reports` : "Suppress report"}
            </Text>
          </Flex>

          <Text color="gray" className="text-[13px]">
            Why are you suppressing {isPlural ? "these" : "this"} {reportNoun}?
            Your feedback is saved with the {reportNoun} and helps PostHog
            improve future reports.
          </Text>

          <RadioGroup.Root
            size="1"
            value={reason ?? ""}
            onValueChange={(value) => setReason(value as DismissalReason)}
          >
            <Flex direction="column" gap="2">
              {DISMISSAL_REASON_OPTIONS.map((option) => (
                <Text
                  key={option.value}
                  as="label"
                  className="cursor-pointer text-[13px]"
                >
                  <Flex align="center" gap="2">
                    <RadioGroup.Item value={option.value} />
                    {option.label}
                  </Flex>
                </Text>
              ))}
            </Flex>
          </RadioGroup.Root>

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              Optional: add detail
            </Text>
            <TextArea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything else worth mentioning?"
              size="1"
              rows={3}
              maxLength={4000}
              disabled={isSubmitting}
            />
          </Flex>

          <Flex gap="2" justify="end">
            <Dialog.Close>
              <Button size="1" variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              size="1"
              variant="solid"
              color="orange"
              disabled={!reason || isSubmitting}
              disabledReason={!reason ? "you haven't picked a reason" : null}
              onClick={handleConfirm}
            >
              {isSubmitting ? <Spinner size="1" /> : <EyeSlashIcon size={12} />}
              Suppress
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
