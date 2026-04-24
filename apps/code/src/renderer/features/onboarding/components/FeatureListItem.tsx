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
        className={`feature-list-item cursor-default select-none pl-3 ${active ? "feature-list-item--active" : ""}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Flex
          align="center"
          justify="center"
          style={{
            opacity: active ? 1 : 0.6,
            transition: "opacity 0.2s ease, transform 0.2s ease",
            transform: active ? "scale(1.1)" : "scale(1)",
          }}
          className="mt-[2px] shrink-0 text-(--gray-12)"
        >
          {icon}
        </Flex>
        <Flex direction="column" gap="1">
          <Text className="font-medium text-(--gray-12) text-base">
            {title}
          </Text>
          <Text className="feature-list-item__description text-(--gray-12) text-sm opacity-50">
            {description}
          </Text>
        </Flex>
      </Flex>
    </motion.div>
  );
}
