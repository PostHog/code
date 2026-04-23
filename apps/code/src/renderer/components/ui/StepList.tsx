import {
  CheckCircle,
  Circle,
  CircleNotch,
  XCircle,
} from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Step {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

interface StepIconProps {
  status: StepStatus;
  size?: number;
}

export function StepIcon({ status, size = 14 }: StepIconProps) {
  switch (status) {
    case "in_progress":
      return <CircleNotch size={size} className="animate-spin text-blue-9" />;
    case "completed":
      return <CheckCircle size={size} weight="fill" className="text-green-9" />;
    case "failed":
      return <XCircle size={size} weight="fill" className="text-red-9" />;
    default:
      return <Circle size={size} className="text-gray-8" />;
  }
}

interface StepRowProps {
  step: Step;
  size?: "1" | "2";
}

function StepRow({ step, size = "2" }: StepRowProps) {
  return (
    <Flex direction="column" gap="0">
      <Flex align="center" gap="2">
        <StepIcon status={step.status} />
        <Text size={size} className="text-gray-12">
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
  );
}

interface StepListProps {
  steps: Step[];
  /** Text size for step labels. Default "2". */
  size?: "1" | "2";
  /** Gap between step rows. Default "1". */
  gap?: "1" | "2" | "3";
}

export function StepList({ steps, size = "2", gap = "1" }: StepListProps) {
  return (
    <Flex direction="column" gap={gap}>
      {steps.map((step) => (
        <StepRow key={step.key} step={step} size={size} />
      ))}
    </Flex>
  );
}
