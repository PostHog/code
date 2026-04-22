import type { DiscoveredTask } from "@features/setup/types";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowRight,
  Bug,
  ChartLine,
  Copy,
  Flag,
  Funnel,
  Lightning,
  Lock,
  Trash,
  Warning,
  Wrench,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";

const CATEGORY_CONFIG: Record<
  DiscoveredTask["category"],
  { icon: Icon; color: string }
> = {
  bug: { icon: Bug, color: "red" },
  security: { icon: Lock, color: "red" },
  dead_code: { icon: Trash, color: "gray" },
  duplication: { icon: Copy, color: "orange" },
  performance: { icon: Lightning, color: "green" },
  stale_feature_flag: { icon: Flag, color: "amber" },
  error_tracking: { icon: Warning, color: "orange" },
  event_tracking: { icon: ChartLine, color: "blue" },
  funnel: { icon: Funnel, color: "violet" },
};

interface SuggestedTasksProps {
  tasks: DiscoveredTask[];
  onSelectTask: (task: DiscoveredTask) => void;
}

export function SuggestedTasks({ tasks, onSelectTask }: SuggestedTasksProps) {
  if (tasks.length === 0) {
    return (
      <Flex
        align="center"
        justify="center"
        py="4"
        style={{ color: "var(--gray-9)" }}
      >
        <Text size="2">No issues found. Your codebase looks clean!</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3" style={{ width: "100%" }}>
      {tasks.map((task, index) => {
        const config = CATEGORY_CONFIG[task.category] ?? {
          icon: Wrench,
          color: "gray",
        };
        const TaskIcon = config.icon;
        return (
          <motion.button
            key={task.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.08 }}
            onClick={() => onSelectTask(task)}
            type="button"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "16px 18px",
              backgroundColor: "var(--color-panel-solid)",
              border: "1px solid var(--gray-a3)",
              borderRadius: 12,
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            whileHover={{
              borderColor: `var(--${config.color}-6)`,
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <Flex
              align="center"
              justify="center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: `var(--${config.color}-3)`,
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <TaskIcon
                size={18}
                weight="duotone"
                color={`var(--${config.color}-9)`}
              />
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" justify="between" gap="2">
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: "var(--gray-12)" }}
                >
                  {task.title}
                </Text>
                <ArrowRight
                  size={14}
                  color="var(--gray-8)"
                  style={{ flexShrink: 0 }}
                />
              </Flex>
              <Text
                size="1"
                style={{
                  color: "var(--gray-11)",
                  lineHeight: 1.5,
                }}
              >
                {task.description}
              </Text>
              {task.file && (
                <Text
                  size="1"
                  style={{
                    color: "var(--gray-9)",
                    fontStyle: "italic",
                    marginTop: 2,
                  }}
                >
                  {task.file}
                  {task.lineHint ? `:${task.lineHint}` : ""}
                </Text>
              )}
            </Flex>
          </motion.button>
        );
      })}
    </Flex>
  );
}
