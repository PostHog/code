import { Flex, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";

interface OnboardingHogTipProps {
  hogSrc: string;
  message: string;
  delay?: number;
}

export function OnboardingHogTip({
  hogSrc,
  message,
  delay = 0.1,
}: OnboardingHogTipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Flex align="center" gap="3">
        <img
          src={hogSrc}
          alt=""
          style={{
            width: 48,
            height: 48,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            position: "relative",
            backgroundColor: "var(--color-panel-solid)",
            border: "1px solid var(--gray-a4)",
            borderRadius: "var(--radius-3)",
            padding: "6px 12px",
          }}
        >
          {/* Border tail */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: -8,
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: "8px solid var(--gray-a4)",
            }}
          />
          {/* Fill tail */}
          <div
            style={{
              position: "absolute",
              top: 15,
              left: -7,
              width: 0,
              height: 0,
              borderTop: "7px solid transparent",
              borderBottom: "7px solid transparent",
              borderRight: "7px solid var(--color-panel-solid)",
            }}
          />
          <Text size="1" style={{ color: "var(--gray-11)", lineHeight: 1.5 }}>
            {message}
          </Text>
        </div>
      </Flex>
    </motion.div>
  );
}
