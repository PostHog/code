import { GitBranch, Warning } from "@phosphor-icons/react";
import {
  AlertDialog,
  Button,
  Callout,
  Code,
  Flex,
  Text,
} from "@radix-ui/themes";

interface BranchMismatchDialogProps {
  open: boolean;
  linkedBranch: string;
  currentBranch: string;
  hasUncommittedChanges: boolean;
  switchError: string | null;
  onSwitch: () => void;
  onContinue: () => void;
  onCancel: () => void;
  isSwitching?: boolean;
}

function BranchLabel({ name }: { name: string }) {
  return (
    <Code
      size="2"
      variant="ghost"
      truncate
      style={{
        maxWidth: "100%",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <GitBranch size={12} style={{ flexShrink: 0 }} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </Code>
  );
}

export function BranchMismatchDialog({
  open,
  linkedBranch,
  currentBranch,
  hasUncommittedChanges,
  switchError,
  onSwitch,
  onContinue,
  onCancel,
  isSwitching,
}: BranchMismatchDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialog.Content maxWidth="420px" size="2">
        <AlertDialog.Title size="3">
          <Flex align="center" gap="2">
            <Warning size={18} weight="fill" color="var(--orange-9)" />
            Wrong branch
          </Flex>
        </AlertDialog.Title>
        <AlertDialog.Description size="2">
          This task is linked to a different branch than the one you're
          currently on. The agent will make changes on the current branch.
        </AlertDialog.Description>
        <Flex direction="column" gap="1" mt="3" style={{ minWidth: 0 }}>
          <Flex align="center" gap="2" style={{ minWidth: 0 }}>
            <Text
              size="1"
              color="gray"
              style={{ flexShrink: 0, width: "64px" }}
            >
              Linked
            </Text>
            <BranchLabel name={linkedBranch} />
          </Flex>
          <Flex align="center" gap="2" style={{ minWidth: 0 }}>
            <Text
              size="1"
              color="gray"
              style={{ flexShrink: 0, width: "64px" }}
            >
              Current
            </Text>
            <BranchLabel name={currentBranch} />
          </Flex>
        </Flex>

        {hasUncommittedChanges && !switchError && (
          <Callout.Root size="1" color="gray" mt="3">
            <Callout.Text size="1">
              You have uncommitted changes on your current branch. If needed,
              commit or stash them first.
            </Callout.Text>
          </Callout.Root>
        )}

        {switchError && (
          <Callout.Root size="1" color="red" mt="3">
            <Callout.Text size="1">{switchError}</Callout.Text>
          </Callout.Root>
        )}

        <Flex justify="end" gap="2" mt="4">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" size="1" disabled={isSwitching}>
              Cancel
            </Button>
          </AlertDialog.Cancel>

          <Button
            variant="soft"
            color="orange"
            size="1"
            onClick={onContinue}
            disabled={isSwitching}
          >
            Continue anyway
          </Button>

          <AlertDialog.Action>
            <Button
              variant="solid"
              size="1"
              onClick={onSwitch}
              loading={isSwitching}
            >
              Switch branch
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
