import { Flex, Text } from "@radix-ui/themes";
import { motion, useAnimationControls } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";

interface OnboardingHogTipProps {
  hogSrc: string;
  message: string;
  delay?: number;
}

const talkingAnimation = {
  rotate: [0, -3, 3, -2, 2, 0],
  y: [0, -2, 0, -1, 0],
  transition: {
    duration: 0.4,
    repeat: Infinity,
    repeatDelay: 0.1,
  },
};

export function OnboardingHogTip({
  hogSrc,
  message,
  delay = 0.1,
}: OnboardingHogTipProps) {
  const controls = useAnimationControls();

  const isHovering = useRef(false);

  useEffect(() => {
    const startDelay = (delay + 0.3) * 1000;
    const startTimer = setTimeout(() => {
      controls.start(talkingAnimation);
    }, startDelay);
    const stopTimer = setTimeout(() => {
      if (!isHovering.current) {
        controls.stop();
        controls.set({ rotate: 0, y: 0 });
      }
    }, startDelay + 5000);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
    };
  }, [controls, delay]);

  const handleMouseEnter = useCallback(() => {
    isHovering.current = true;
    controls.start(talkingAnimation);
  }, [controls]);

  const handleMouseLeave = useCallback(() => {
    isHovering.current = false;
    controls.stop();
    controls.set({ rotate: 0, y: 0 });
  }, [controls]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "default" }}
    >
      <Flex align="center" gap="3">
        <motion.img
          src={hogSrc}
          alt=""
          animate={controls}
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
