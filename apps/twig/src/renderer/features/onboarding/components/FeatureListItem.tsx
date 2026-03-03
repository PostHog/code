import { Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface FeatureListItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureListItem({
  icon,
  title,
  description,
}: FeatureListItemProps) {
  return (
    <Flex align="start" gap="3" py="3" px="4">
      <Flex
        align="center"
        justify="center"
        style={{
          color: "var(--cave-charcoal)",
          opacity: 0.6,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {icon}
      </Flex>
      <Flex direction="column" gap="1">
        <Text
          size="3"
          weight="medium"
          style={{ color: "var(--cave-charcoal)" }}
        >
          {title}
        </Text>
        <Text
          size="2"
          style={{
            color: "var(--cave-charcoal)",
            opacity: 0.5,
          }}
        >
          {description}
        </Text>
      </Flex>
    </Flex>
  );
}
