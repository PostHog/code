import { Flex, Select, Text } from "@radix-ui/themes";
import { IS_DEV } from "@shared/constants/environment";
import type { CloudRegion } from "@shared/types/oauth";
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
      <Text size="2">
        <span style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
          {regionLabel}
          {" \u00B7 "}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent-9)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "inherit",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          change
        </button>
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2" style={{ width: "100%" }}>
      <Flex justify="between" align="center">
        <Text
          size="2"
          weight="medium"
          style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
        >
          PostHog region
        </Text>
        <Text size="2" style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent-9)",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "inherit",
            }}
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
