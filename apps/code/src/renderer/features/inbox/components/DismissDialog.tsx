import { AlertDialog, Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

type DismissReason = "wrong" | "not-now" | "already-handled" | "other";

interface DismissDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: DismissReason, note: string) => void;
}

const REASON_OPTIONS: { value: DismissReason; label: string }[] = [
  { value: "wrong", label: "Wrong" },
  { value: "not-now", label: "Not now" },
  { value: "already-handled", label: "Already handled" },
  { value: "other", label: "Other" },
];

export function DismissDialog({
  open,
  onOpenChange,
  onConfirm,
}: DismissDialogProps) {
  const [reason, setReason] = useState<DismissReason>("not-now");
  const [note, setNote] = useState("");

  // Reset form when dialog opens for a new item
  useEffect(() => {
    if (open) {
      setReason("not-now");
      setNote("");
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm(reason, note);
    setReason("not-now");
    setNote("");
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="400px">
        <AlertDialog.Title>
          <Text className="font-bold">Dismiss this item</Text>
        </AlertDialog.Title>
        <AlertDialog.Description className="text-[13px]">
          <Text className="text-(--gray-11)">Why are you dismissing this?</Text>
        </AlertDialog.Description>

        <Flex direction="column" gap="2" mt="3">
          {REASON_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="dismiss-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="accent-amber-9"
              />
              <Text className="text-[13px]">{option.label}</Text>
            </label>
          ))}

          <textarea
            placeholder="Optional note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-(--gray-5) bg-transparent px-2.5 py-1.5 text-(--gray-12) text-[13px] outline-none placeholder:text-(--gray-8) focus:border-(--gray-7)"
            rows={2}
          />
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-(--gray-11) text-[13px] hover:bg-(--gray-3) focus:outline-none focus:ring-1 focus:ring-amber-6"
            >
              Cancel
            </button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-md bg-amber-9 px-3 py-1.5 font-medium text-[13px] text-white hover:bg-amber-10 focus:outline-none focus:ring-1 focus:ring-amber-6 focus:ring-offset-1"
            >
              Dismiss
            </button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
