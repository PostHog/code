import type { ProgressStep } from "@features/sessions/components/buildConversationItems";
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

interface ProgressGroupViewProps {
  steps: ProgressStep[];
  /** True while at least one step in this group is `in_progress`. */
  isActive: boolean;
  /** True once the enclosing turn has finished. Drives the auto-collapse. */
  turnComplete?: boolean;
}

type ProgressStatus = ProgressStep["status"];

function StepIcon({ status }: { status: ProgressStatus }) {
  switch (status) {
    case "in_progress":
      return <CircleNotchIcon size={14} className="animate-spin text-blue-9" />;
    case "completed":
      return (
        <CheckCircleIcon size={14} weight="fill" className="text-green-9" />
      );
    case "failed":
      return <XCircleIcon size={14} weight="fill" className="text-red-9" />;
    default:
      return <CircleIcon size={14} className="text-gray-8" />;
  }
}

// Header label follows the stream: the currently in-flight step's label if
// any, otherwise the last step seen. No hardcoded fallbacks — the backend
// controls all wording, including present-tense during `in_progress`.
function resolveHeaderLabel(steps: ProgressStep[]): string | null {
  if (steps.length === 0) return null;
  const active = steps.find((s) => s.status === "in_progress");
  if (active) return active.label;
  return steps[steps.length - 1].label;
}

export function ProgressGroupView({
  steps,
  isActive,
  turnComplete,
}: ProgressGroupViewProps) {
  // Multi-step groups always render a collapsible header (caret + summary).
  // While the turn is still running the trigger is disabled and forced open,
  // so the user sees progress stream in without a flicker between consecutive
  // step transitions. Once the turn completes, the header auto-collapses and
  // becomes interactive. Single-step groups have no header at all — the one
  // step row IS the whole view.
  const [userToggledOpen, setUserToggledOpen] = useState<boolean | null>(null);

  useEffect(() => {
    // Any reactivation clears the sticky user choice so a new round of work
    // starts expanded again.
    if (isActive) setUserToggledOpen(null);
  }, [isActive]);

  if (steps.length === 0) return null;

  const hasHeader = steps.length > 1;
  // Single-step groups have no header, so their body must stay expanded —
  // collapsing with no header would leave nothing on screen. Multi-step groups
  // stay open while the turn is running, then honour the user toggle once the
  // turn completes (default: collapsed).
  const isOpen = !hasHeader
    ? true
    : !turnComplete
      ? true
      : (userToggledOpen ?? true);
  const summaryLabel = resolveHeaderLabel(steps) ?? "";

  return (
    <Box className="my-1">
      <Collapsible.Root
        open={isOpen}
        onOpenChange={(next) => {
          if (hasHeader && turnComplete) setUserToggledOpen(next);
        }}
      >
        {hasHeader && (
          <Collapsible.Trigger asChild disabled={!turnComplete}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left enabled:hover:bg-gray-3 disabled:cursor-default"
            >
              {isOpen ? (
                <CaretDownIcon size={12} className="text-gray-10" />
              ) : (
                <CaretRightIcon size={12} className="text-gray-10" />
              )}
              <Text size="2" weight="medium" className="text-gray-12">
                {summaryLabel}
              </Text>
            </button>
          </Collapsible.Trigger>
        )}
        <Collapsible.Content>
          <Flex direction="column" gap="1" pl={hasHeader ? "4" : "0"} py="1">
            {steps.map((step) => (
              <Flex key={step.key} direction="column" gap="0">
                <Flex align="center" gap="2">
                  <StepIcon status={step.status} />
                  <Text size="2" className="text-gray-12">
                    {step.label}
                  </Text>
                </Flex>
                {step.detail && (
                  <Box pl="5">
                    <Text size="1" className="text-gray-10">
                      {step.detail}
                    </Text>
                  </Box>
                )}
              </Flex>
            ))}
          </Flex>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}
