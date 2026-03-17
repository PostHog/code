import { CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import type { SourceState } from "../../hooks/useContextCollection";

interface SourceSlotProps {
  source: SourceState;
}

export function SourceSlot({ source }: SourceSlotProps) {
  const { config, status, currentItem, currentCount } = source;
  const Icon = config.icon;
  const isScanning = status === "scanning";
  const isDone = status === "done";
  const isWaiting = status === "waiting";

  return (
    <Flex
      align="center"
      gap="3"
      px="4"
      style={{
        height: 48,
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-a3)",
        borderRadius: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        opacity: isWaiting ? 0.45 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Icon + label (fixed left side) */}
      <Flex align="center" gap="2" style={{ minWidth: 180, flexShrink: 0 }}>
        <Flex
          align="center"
          justify="center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: `var(--${config.color}-3)`,
            flexShrink: 0,
          }}
        >
          {isDone ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={16} weight="fill" color="var(--green-9)" />
            </motion.div>
          ) : (
            <Icon size={16} color={`var(--${config.color}-9)`} />
          )}
        </Flex>
        <Text
          size="2"
          weight="medium"
          style={{ color: "var(--gray-12)", whiteSpace: "nowrap" }}
        >
          {config.label}
        </Text>
      </Flex>

      {/* Right side: ephemeral item or summary — fixed layout with absolute positioning */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", height: 20 }}>
        <AnimatePresence mode="wait">
          {isScanning && currentItem && (
            <motion.div
              key={currentItem}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 20,
                maxWidth: "100%",
              }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Number.POSITIVE_INFINITY,
                  duration: 1,
                  ease: "linear",
                }}
                style={{ flexShrink: 0, display: "flex" }}
              >
                <CircleNotch size={12} color="var(--gray-8)" />
              </motion.div>
              <Text
                size="1"
                style={{
                  color: "var(--gray-9)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentItem}
              </Text>
            </motion.div>
          )}

          {isDone && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                height: 20,
              }}
            >
              <Text
                size="1"
                weight="medium"
                style={{
                  color: "var(--gray-11)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {currentCount.toLocaleString()} items
              </Text>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Flex>
  );
}
