import type { Icon } from "@phosphor-icons/react";
import {
  ArrowRight,
  Bug,
  TestTube,
  Warning,
  Wrench,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";

interface TaskCard {
  id: string;
  title: string;
  description: string;
  context: string;
  icon: Icon;
  color: string;
}

const MOCK_TASKS: TaskCard[] = [
  {
    id: "fix-checkout-typeerror",
    title: "Fix TypeError in checkout flow",
    description:
      "Cannot read property 'id' of undefined in checkout.ts:142. Spiked 3x this week, failing 12% of purchase sessions.",
    context: "Based on 83 error events and 342 session recordings",
    icon: Bug,
    color: "red",
  },
  {
    id: "add-error-handling-payments",
    title: "Add error handling to payments API",
    description:
      "The /api/payments/create endpoint has no try-catch around the Stripe call. 23 unhandled rejections logged this week.",
    context: "Based on 23 unhandled errors in PostHog",
    icon: Warning,
    color: "orange",
  },
  {
    id: "write-tests-auth-migration",
    title: "Write tests for auth migration",
    description:
      "PR #156 migrates session auth to OAuth2 but has 0% test coverage. 4 critical paths are untested.",
    context: "Based on GitHub PR #156 and 0 test files",
    icon: TestTube,
    color: "violet",
  },
  {
    id: "fix-n-plus-one-dashboard",
    title: "Fix N+1 query in dashboard endpoint",
    description:
      "GET /api/dashboards loads each widget individually. P95 latency is 4.2s — could be under 200ms with a single query.",
    context: "Based on 1,891 slow requests in session data",
    icon: Wrench,
    color: "green",
  },
];

interface SuggestedTasksProps {
  onSelectTask: (taskId: string) => void;
}

export function SuggestedTasks({ onSelectTask }: SuggestedTasksProps) {
  return (
    <Flex direction="column" gap="3" style={{ width: "100%" }}>
      {MOCK_TASKS.map((task, index) => {
        const TaskIcon = task.icon;
        return (
          <motion.button
            key={task.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.08 }}
            onClick={() => onSelectTask(task.id)}
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
              borderColor: `var(--${task.color}-6)`,
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
                backgroundColor: `var(--${task.color}-3)`,
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <TaskIcon
                size={18}
                weight="duotone"
                color={`var(--${task.color}-9)`}
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
              <Text
                size="1"
                style={{
                  color: "var(--gray-9)",
                  fontStyle: "italic",
                  marginTop: 2,
                }}
              >
                {task.context}
              </Text>
            </Flex>
          </motion.button>
        );
      })}
    </Flex>
  );
}
