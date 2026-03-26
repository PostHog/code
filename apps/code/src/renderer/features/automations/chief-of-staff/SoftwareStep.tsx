import { SpinnerGap } from "@phosphor-icons/react";
import { Box, Button, Checkbox, Flex, Text } from "@radix-ui/themes";
import { ALL_SOFTWARE } from "./chief-of-staff-types";

interface SoftwareStepProps {
  selectedSoftware: Set<string>;
  onToggle: (tool: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isLoading: boolean;
}

export function SoftwareStep({
  selectedSoftware,
  onToggle,
  onSelectAll,
  onDeselectAll,
  isLoading,
}: SoftwareStepProps) {
  if (isLoading) {
    return (
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="3"
        className="py-12"
      >
        <SpinnerGap size={24} className="animate-spin text-gray-10" />
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          Analyzing your role and finding relevant automations / moving you to
          post capitalism (you are welcome)...
        </Text>
      </Flex>
    );
  }

  const allSelected = selectedSoftware.size === ALL_SOFTWARE.length;

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">
          What tools do you use?
        </Text>
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          We'll filter automations to match your tools. Edit the selection
          below.
        </Text>
      </Flex>

      <Flex gap="2">
        <Button
          size="1"
          variant="soft"
          color="gray"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </Flex>

      <Flex gap="2" wrap="wrap">
        {ALL_SOFTWARE.map((tool) => {
          const checked = selectedSoftware.has(tool);
          return (
            <Box
              key={tool}
              className={`cursor-pointer rounded-md border px-3 py-2 transition-colors ${
                checked
                  ? "border-accent-8 bg-accent-2"
                  : "border-gray-5 bg-gray-1 hover:border-gray-7"
              }`}
              onClick={() => onToggle(tool)}
            >
              <Flex align="center" gap="2">
                <Checkbox
                  size="1"
                  checked={checked}
                  style={{ pointerEvents: "none", flexShrink: 0 }}
                />
                <Text size="1" className="font-mono text-[12px]">
                  {tool}
                </Text>
              </Flex>
            </Box>
          );
        })}
      </Flex>
    </Flex>
  );
}
