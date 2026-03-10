import { ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import zenHedgehog from "@renderer/assets/images/zen.png";
import { AnimatePresence, motion } from "framer-motion";

interface TutorialHedgehogProps {
  message: string;
  onNext?: () => void;
  stepNumber: number;
  totalSteps: number;
}

export function TutorialHedgehog({
  message,
  onNext,
  stepNumber,
  totalSteps,
}: TutorialHedgehogProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 36,
        right: 24,
        zIndex: 200,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {/* Speech bubble — to the left of the hedgehog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        style={{
          position: "relative",
          marginTop: 28,
          pointerEvents: "auto",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{
              backgroundColor: "var(--color-panel-solid)",
              border: "1px solid var(--accent-7)",
              borderRadius: "var(--radius-3)",
              padding: "10px 14px",
              maxWidth: 240,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <Flex direction="column" gap="2">
              <Text
                size="1"
                style={{
                  color: "var(--gray-11)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {message}
              </Text>
              <Flex justify="between" align="center">
                <Text size="1" style={{ color: "var(--gray-9)" }}>
                  {stepNumber}/{totalSteps}
                </Text>
                {onNext && (
                  <Button
                    size="1"
                    variant="soft"
                    onClick={onNext}
                    style={{ pointerEvents: "auto" }}
                  >
                    Next
                    <ArrowRight size={11} />
                  </Button>
                )}
              </Flex>
            </Flex>

            {/* Tail pointing right toward hedgehog */}
            <div
              style={{
                position: "absolute",
                top: 16,
                right: -8,
                width: 0,
                height: 0,
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "8px solid var(--accent-7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 17,
                right: -7,
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderLeft: "7px solid var(--color-panel-solid)",
              }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Hedgehog image — layoutId matches ZenHedgehog for seamless transition */}
      <div className="zen-float" style={{ pointerEvents: "auto" }}>
        <motion.img
          layoutId="zen-hedgehog"
          src={zenHedgehog}
          alt=""
          style={{
            width: "100px",
            display: "block",
            cursor: "default",
          }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 20,
            mass: 0.8,
          }}
        />
      </div>
    </div>
  );
}
