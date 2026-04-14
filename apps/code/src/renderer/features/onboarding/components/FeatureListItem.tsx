import { Flex, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import "./FeatureListItem.css";

interface FeatureListItemProps {
  icon: ReactNode;
  title: string;
  description: string;
  active?: boolean;
  index?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function FeatureListItem({
  icon,
  title,
  description,
  active = false,
  index = 0,
  onMouseEnter,
  onMouseLeave,
}: FeatureListItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Flex
        align="start"
        gap="3"
        py="2"
        pr="4"
        className={`feature-list-item ${active ? "feature-list-item--active" : ""}`}
        style={{
          userSelect: "none",
          cursor: "default",
          paddingLeft: "var(--space-3)",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Flex
          align="center"
          justify="center"
          style={{
            color: "var(--gray-12)",
            opacity: active ? 1 : 0.6,
            flexShrink: 0,
            marginTop: 2,
            transition: "opacity 0.2s ease, transform 0.2s ease",
            transform: active ? "scale(1.1)" : "scale(1)",
          }}
        >
          {icon}
        </Flex>
        <Flex direction="column" gap="1">
          <Text size="3" weight="medium" style={{ color: "var(--gray-12)" }}>
            {title}
          </Text>
          <Text
            size="2"
            className="feature-list-item__description"
            style={{
              color: "var(--gray-12)",
              opacity: 0.5,
            }}
          >
            {description}
          </Text>
        </Flex>
      </Flex>
    </motion.div>
  );
}
