import { Button, Flex, Text, Theme } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "../types";

interface TourTooltipProps {
  step: TourStep;
  stepNumber: number;
  totalSteps: number;
  onDismiss: () => void;
}

const HOG_SIZE = 64;
const CARET_SIZE = 12;
const CARET_INNER = 11;

const talkingAnimation = {
  rotate: [0, -3, 3, -2, 2, 0],
  y: [0, -2, 0, -1, 0],
  transition: {
    duration: 0.4,
    repeat: Infinity,
    repeatDelay: 0.1,
  },
};

const bubbleVariants = {
  initial: { opacity: 0, scale: 0.92, x: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    x: 10,
    transition: { duration: 0.15 },
  },
};

const hogEntranceVariants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 18,
      delay: 0.15,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    transition: { duration: 0.1 },
  },
};

function RightCaret() {
  const borderColor = "var(--gray-a5)";
  const fillColor = "var(--color-panel-solid)";

  const base: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
  };

  return (
    <>
      <div
        style={{
          ...base,
          top: "50%",
          right: -CARET_SIZE,
          marginTop: -CARET_SIZE,
          borderTop: `${CARET_SIZE}px solid transparent`,
          borderBottom: `${CARET_SIZE}px solid transparent`,
          borderLeft: `${CARET_SIZE}px solid ${borderColor}`,
        }}
      />
      <div
        style={{
          ...base,
          top: "50%",
          right: -CARET_INNER,
          marginTop: -CARET_INNER,
          borderTop: `${CARET_INNER}px solid transparent`,
          borderBottom: `${CARET_INNER}px solid transparent`,
          borderLeft: `${CARET_INNER}px solid ${fillColor}`,
        }}
      />
    </>
  );
}

export function TourTooltip({
  step,
  stepNumber,
  totalSteps,
  onDismiss,
}: TourTooltipProps) {
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const controls = useAnimationControls();

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart animation on step change
  useEffect(() => {
    controls.stop();
    const timer = setTimeout(() => {
      controls.start(talkingAnimation);
    }, 500);
    return () => clearTimeout(timer);
  }, [controls, step.id]);

  return createPortal(
    <Theme
      appearance={isDarkMode ? "dark" : "light"}
      accentColor={isDarkMode ? "yellow" : "orange"}
      grayColor="slate"
      panelBackground="solid"
      radius="medium"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 201,
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="wait">
        <div
          key={step.id}
          style={{
            position: "fixed",
            top: 72,
            right: 24,
            zIndex: 201,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          <motion.div
            variants={bubbleVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              position: "relative",
              backgroundColor: "var(--color-panel-solid)",
              border: "1px solid var(--gray-a5)",
              borderRadius: "var(--radius-3)",
              padding: "14px 18px",
              maxWidth: 280,
              boxShadow:
                "0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08)",
              transformOrigin: "right center",
            }}
          >
            <RightCaret />
            <Flex direction="column" gap="2">
              <Text
                size="2"
                style={{ color: "var(--gray-12)", lineHeight: 1.5 }}
              >
                {step.message}
              </Text>
              <Flex justify="between" align="center" gap="3">
                <Text size="1" style={{ color: "var(--gray-9)" }}>
                  {stepNumber}/{totalSteps}
                </Text>
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={onDismiss}
                  style={{ opacity: 0.5 }}
                >
                  Skip tour
                </Button>
              </Flex>
            </Flex>
          </motion.div>

          <motion.div
            variants={hogEntranceVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ marginLeft: 8, flexShrink: 0 }}
          >
            <motion.img
              src={step.hogSrc}
              alt=""
              animate={controls}
              style={{
                width: HOG_SIZE,
                height: HOG_SIZE,
                objectFit: "contain",
              }}
            />
          </motion.div>
        </div>
      </AnimatePresence>
    </Theme>,
    document.body,
  );
}
