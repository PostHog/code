import { Flex, Select, Text } from "@radix-ui/themes";
import { IS_DEV } from "@shared/constants/environment";
import type { CloudRegion } from "@shared/types/regions";
import { useState } from "react";

interface RegionSelectProps {
  region: CloudRegion;
  regionLabel: string;
  onRegionChange: (region: CloudRegion) => void;
  disabled?: boolean;
}

export function RegionSelect({
  region,
  regionLabel,
  onRegionChange,
  disabled = false,
}: RegionSelectProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <Text className="mt-[10px] text-sm">
        <span className="text-(--gray-12) opacity-50">
          {regionLabel}
          {" \u00B7 "}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          style={{
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: "inherit",
            opacity: disabled ? 0.5 : 1,
          }}
          className="border-0 bg-transparent p-0 font-medium text-(--accent-9)"
        >
          change
        </button>
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2" className="mt-[10px] w-full">
      <Flex justify="between" align="center">
        <Text className="font-medium text-(--gray-12) text-sm opacity-60">
          PostHog region
        </Text>
        <Text className="text-(--gray-12) text-sm opacity-50">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              fontSize: "inherit",
            }}
            className="cursor-pointer border-0 bg-transparent p-0 font-medium text-(--accent-9)"
          >
            cancel
          </button>
        </Text>
      </Flex>
      <Select.Root
        value={region}
        onValueChange={(value) => {
          onRegionChange(value as CloudRegion);
          setExpanded(false);
        }}
        size="2"
        disabled={disabled}
      >
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="us">US Cloud</Select.Item>
          <Select.Item value="eu">EU Cloud</Select.Item>
          {IS_DEV && <Select.Item value="dev">Development</Select.Item>}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}
