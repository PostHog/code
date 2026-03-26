import { MagicWand } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import type { SuggestedAutomation } from "./chief-of-staff-types";

interface AutomationsStepProps {
  generatedAutomations: SuggestedAutomation[];
  existingTemplates: SuggestedAutomation[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

function AutomationItem({
  automation,
  checked,
  onToggle,
}: {
  automation: SuggestedAutomation;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
        checked
          ? "border-accent-8 bg-accent-2"
          : "border-gray-5 bg-gray-1 hover:border-gray-7"
      }`}
      onClick={onToggle}
    >
      <Flex gap="3" align="start">
        <Checkbox
          size="1"
          checked={checked}
          className="mt-0.5"
          style={{ pointerEvents: "none", flexShrink: 0 }}
        />
        <Flex direction="column" gap="1" className="min-w-0 flex-1">
          <Flex align="center" gap="2">
            <Text
              size="2"
              weight="medium"
              className="truncate font-mono text-[12px]"
            >
              {automation.name}
            </Text>
            {automation.source === "generated" && (
              <Badge size="1" variant="soft" color="orange">
                <MagicWand size={10} />
                Generated
              </Badge>
            )}
          </Flex>
          <Text size="1" className="font-mono text-[11px] text-gray-10">
            {automation.description}
          </Text>
          {automation.mcps && automation.mcps.length > 0 && (
            <Flex gap="1" wrap="wrap" className="mt-1">
              {automation.mcps.map((mcp) => (
                <Badge key={mcp} size="1" variant="outline" color="gray">
                  {mcp}
                </Badge>
              ))}
            </Flex>
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

export function AutomationsStep({
  generatedAutomations,
  existingTemplates,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: AutomationsStepProps) {
  const totalCount = generatedAutomations.length + existingTemplates.length;
  const allSelected = selectedIds.size === totalCount;

  return (
    <Flex direction="column" gap="4" className="min-h-0 flex-1">
      <Flex direction="column" gap="1">
        <Flex align="center" gap="2">
          <Text size="3" weight="bold">
            Suggested automations
          </Text>
          <Badge size="1" variant="soft">
            {selectedIds.size} / {totalCount}
          </Badge>
        </Flex>
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          Uncheck any you don't want to enable.
        </Text>
      </Flex>

      <Button
        size="1"
        variant="soft"
        color="gray"
        onClick={allSelected ? onDeselectAll : onSelectAll}
        className="w-fit"
      >
        {allSelected ? "Deselect all" : "Enable all"}
      </Button>

      <ScrollArea
        type="auto"
        style={{ maxHeight: 340 }}
        className="min-h-0 flex-1"
      >
        <Flex direction="column" gap="2" pr="3">
          {generatedAutomations.length > 0 && (
            <>
              <Flex align="center" gap="1" className="mt-1">
                <MagicWand size={12} className="text-orange-9" />
                <Text
                  size="1"
                  weight="medium"
                  className="font-mono text-[11px]"
                >
                  Custom for you
                </Text>
              </Flex>
              {generatedAutomations.map((automation) => (
                <AutomationItem
                  key={automation.id}
                  automation={automation}
                  checked={selectedIds.has(automation.id)}
                  onToggle={() => onToggle(automation.id)}
                />
              ))}
            </>
          )}

          {existingTemplates.length > 0 && (
            <>
              <Flex align="center" gap="1" className="mt-3">
                <Text
                  size="1"
                  weight="medium"
                  className="font-mono text-[11px]"
                >
                  From template library
                </Text>
              </Flex>
              {existingTemplates.map((automation) => (
                <AutomationItem
                  key={automation.id}
                  automation={automation}
                  checked={selectedIds.has(automation.id)}
                  onToggle={() => onToggle(automation.id)}
                />
              ))}
            </>
          )}

          {totalCount === 0 && (
            <Text size="1" className="py-4 font-mono text-[11px] text-gray-10">
              No automations match your current tool selection. Try adding more
              tools.
            </Text>
          )}
        </Flex>
      </ScrollArea>
    </Flex>
  );
}
