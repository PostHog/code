import { Button, Flex, Text, Theme } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { CaretDirection, TourStep } from "../types";

interface TourTooltipProps {
  step: TourStep;
  stepNumber: number;
  totalSteps: number;
  targetRect: DOMRect;
  onDismiss: () => void;
}

const TOOLTIP_GAP = 16;
const HOG_SIZE = 56;
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

function CaretPair({ direction }: { direction: CaretDirection }) {
  const borderColor = "var(--gray-a5)";
  const fillColor = "var(--color-panel-solid)";

  const base: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
  };

  let borderStyle: React.CSSProperties;
  let fillStyle: React.CSSProperties;

  switch (direction) {
    case "left":
      borderStyle = {
        ...base,
        top: "50%",
        marginTop: -CARET_SIZE,
        left: -CARET_SIZE,
        borderTop: `${CARET_SIZE}px solid transparent`,
        borderBottom: `${CARET_SIZE}px solid transparent`,
        borderRight: `${CARET_SIZE}px solid ${borderColor}`,
      };
      fillStyle = {
        ...base,
        top: "50%",
        marginTop: -CARET_INNER,
        left: -CARET_INNER,
        borderTop: `${CARET_INNER}px solid transparent`,
        borderBottom: `${CARET_INNER}px solid transparent`,
        borderRight: `${CARET_INNER}px solid ${fillColor}`,
      };
      break;
    case "right":
      borderStyle = {
        ...base,
        top: "50%",
        marginTop: -CARET_SIZE,
        right: -CARET_SIZE,
        borderTop: `${CARET_SIZE}px solid transparent`,
        borderBottom: `${CARET_SIZE}px solid transparent`,
        borderLeft: `${CARET_SIZE}px solid ${borderColor}`,
      };
      fillStyle = {
        ...base,
        top: "50%",
        marginTop: -CARET_INNER,
        right: -CARET_INNER,
        borderTop: `${CARET_INNER}px solid transparent`,
        borderBottom: `${CARET_INNER}px solid transparent`,
        borderLeft: `${CARET_INNER}px solid ${fillColor}`,
      };
      break;
    case "top":
      borderStyle = {
        ...base,
        top: -CARET_SIZE,
        left: 32,
        borderLeft: `${CARET_SIZE}px solid transparent`,
        borderRight: `${CARET_SIZE}px solid transparent`,
        borderBottom: `${CARET_SIZE}px solid ${borderColor}`,
      };
      fillStyle = {
        ...base,
        top: -CARET_INNER,
        left: 33,
        borderLeft: `${CARET_INNER}px solid transparent`,
        borderRight: `${CARET_INNER}px solid transparent`,
        borderBottom: `${CARET_INNER}px solid ${fillColor}`,
      };
      break;
    case "bottom":
      borderStyle = {
        ...base,
        bottom: -CARET_SIZE,
        left: 32,
        borderLeft: `${CARET_SIZE}px solid transparent`,
        borderRight: `${CARET_SIZE}px solid transparent`,
        borderTop: `${CARET_SIZE}px solid ${borderColor}`,
      };
      fillStyle = {
        ...base,
        bottom: -CARET_INNER,
        left: 33,
        borderLeft: `${CARET_INNER}px solid transparent`,
        borderRight: `${CARET_INNER}px solid transparent`,
        borderTop: `${CARET_INNER}px solid ${fillColor}`,
      };
      break;
  }

  return (
    <>
      <div style={borderStyle} />
      <div style={fillStyle} />
    </>
  );
}

const CARET_OFFSET = 32;

function computePosition(
  targetRect: DOMRect,
  caretDirection: CaretDirection,
): { top: number; left: number } {
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  switch (caretDirection) {
    case "bottom":
      return {
        top: targetRect.top - TOOLTIP_GAP - CARET_SIZE,
        left: centerX - CARET_OFFSET - CARET_SIZE,
      };
    case "top":
      return {
        top: targetRect.bottom + TOOLTIP_GAP + CARET_SIZE,
        left: centerX - CARET_OFFSET - CARET_SIZE,
      };
    case "left":
      return {
        top: centerY,
        left: targetRect.right + TOOLTIP_GAP + CARET_SIZE,
      };
    case "right":
      return {
        top: centerY,
        left: targetRect.left - TOOLTIP_GAP - CARET_SIZE,
      };
  }
}

function getTransform(caretDirection: CaretDirection): string {
  switch (caretDirection) {
    case "bottom":
      return "translateY(-100%)";
    case "top":
      return "translateY(0)";
    case "left":
      return "translateY(-50%)";
    case "right":
      return "translate(-100%, -50%)";
  }
}

function getMotionProps(caretDirection: CaretDirection) {
  const slide = 10;
  switch (caretDirection) {
    case "bottom":
      return {
        initial: { opacity: 0, y: slide },
        animate: { opacity: 1, y: 0 },
      };
    case "top":
      return {
        initial: { opacity: 0, y: -slide },
        animate: { opacity: 1, y: 0 },
      };
    case "left":
      return {
        initial: { opacity: 0, x: -slide },
        animate: { opacity: 1, x: 0 },
      };
    case "right":
      return {
        initial: { opacity: 0, x: slide },
        animate: { opacity: 1, x: 0 },
      };
  }
}

export function TourTooltip({
  step,
  stepNumber,
  totalSteps,
  targetRect,
  onDismiss,
}: TourTooltipProps) {
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const controls = useAnimationControls();
  const isHovering = useRef(false);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      controls.start(talkingAnimation);
    }, 500);
    const stopTimer = setTimeout(() => {
      if (!isHovering.current) {
        controls.stop();
        controls.set({ rotate: 0, y: 0 });
      }
    }, 5500);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
    };
  }, [controls]);

  const handleMouseEnter = useCallback(() => {
    isHovering.current = true;
    controls.start(talkingAnimation);
  }, [controls]);

  const handleMouseLeave = useCallback(() => {
    isHovering.current = false;
    controls.stop();
    controls.set({ rotate: 0, y: 0 });
  }, [controls]);

  const pos = computePosition(targetRect, step.caretDirection);
  const motionProps = getMotionProps(step.caretDirection);

  const anchorStyle = useMemo(
    (): React.CSSProperties => ({
      position: "fixed",
      zIndex: 200,
      pointerEvents: "auto",
      top: pos.top,
      left: pos.left,
      transform: getTransform(step.caretDirection),
    }),
    [pos.top, pos.left, step.caretDirection],
  );

  return createPortal(
    <Theme
      appearance={isDarkMode ? "dark" : "light"}
      accentColor={isDarkMode ? "yellow" : "orange"}
      grayColor="slate"
      panelBackground="solid"
      radius="medium"
      style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none" }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={motionProps.initial}
          animate={motionProps.animate}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          style={anchorStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            style={{
              position: "relative",
              backgroundColor: "var(--color-panel-solid)",
              border: "1px solid var(--gray-a5)",
              borderRadius: "var(--radius-3)",
              padding: "10px 16px 10px 10px",
              maxWidth: 360,
              boxShadow:
                "0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.12)",
            }}
          >
            <CaretPair direction={step.caretDirection} />
            <Flex align="center" gap="3">
              <motion.img
                src={step.hogSrc}
                alt=""
                animate={controls}
                style={{
                  width: HOG_SIZE,
                  height: HOG_SIZE,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <Flex direction="column" gap="2" style={{ minWidth: 0 }}>
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
            </Flex>
          </div>
        </motion.div>
      </AnimatePresence>
    </Theme>,
    document.body,
  );
}
