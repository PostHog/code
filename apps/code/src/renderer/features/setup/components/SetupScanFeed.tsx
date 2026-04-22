import type { Icon } from "@phosphor-icons/react";
import {
  CheckCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";

interface ActivityEntry {
  id: number;
  tool: string;
  filePath: string | null;
  title: string;
}

interface SetupScanFeedProps {
  label: string;
  icon: Icon;
  color: string;
  currentTool: string | null;
  currentFilePath: string | null;
  recentEntries: ActivityEntry[];
  isDone: boolean;
  doneLabel?: string;
}

const TOOL_VERBS: Record<string, string> = {
  Read: "Reading",
  Glob: "Searching",
  Grep: "Searching",
  Bash: "Running",
  Edit: "Editing",
  Write: "Writing",
  Agent: "Thinking",
  ListDirectory: "Browsing",
};

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function toolLabel(tool: string, filePath: string | null): string {
  const verb = TOOL_VERBS[tool] ?? tool;
  if (!filePath) return verb;
  return `${verb} ${shortenPath(filePath)}`;
}

export function SetupScanFeed({
  label,
  icon: LabelIcon,
  color,
  currentTool,
  currentFilePath,
  recentEntries,
  isDone,
  doneLabel = "Complete",
}: SetupScanFeedProps) {
  const activeLabel = currentTool ? toolLabel(currentTool, currentFilePath) : null;

  return (
    <Flex direction="column" gap="0" style={{ width: "100%" }}>
      <Flex
        align="center"
        gap="3"
        px="4"
        style={{
          height: 48,
          backgroundColor: "var(--color-panel-solid)",
          border: "1px solid var(--gray-a3)",
          borderRadius: recentEntries.length > 0 && !isDone ? "12px 12px 0 0" : 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
          <Flex
            align="center"
            justify="center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: isDone ? "var(--green-3)" : `var(--${color}-3)`,
              flexShrink: 0,
            }}
          >
            {isDone ? (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 15, stiffness: 300 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <CheckCircle size={16} weight="fill" color="var(--green-9)" />
              </motion.div>
            ) : (
              <LabelIcon size={16} color={`var(--${color}-9)`} />
            )}
          </Flex>
          <Text
            size="2"
            weight="medium"
            style={{ color: "var(--gray-12)", whiteSpace: "nowrap" }}
          >
            {label}
          </Text>
        </Flex>

        <div style={{ flex: 1, minWidth: 0, position: "relative", height: 20 }}>
          <AnimatePresence mode="wait">
            {!isDone && activeLabel && (
              <motion.div
                key={activeLabel}
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
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
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
                  {activeLabel}
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
                <Text size="1" weight="medium" style={{ color: "var(--gray-11)" }}>
                  {doneLabel}
                </Text>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Flex>

      {!isDone && recentEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{ overflow: "hidden" }}
        >
          <Flex
            direction="column"
            gap="0"
            px="3"
            py="2"
            style={{
              backgroundColor: "var(--gray-a2)",
              borderRadius: "0 0 10px 10px",
              borderLeft: "1px solid var(--gray-a3)",
              borderRight: "1px solid var(--gray-a3)",
              borderBottom: "1px solid var(--gray-a3)",
              maxHeight: 120,
              overflow: "hidden",
            }}
          >
            <AnimatePresence initial={false}>
              {recentEntries.slice(-4).map((entry) => {
                const entryLabel = entry.filePath
                  ? shortenPath(entry.filePath)
                  : entry.title || TOOL_VERBS[entry.tool] || entry.tool;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 0.7, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Text
                      size="1"
                      style={{
                        color: "var(--gray-9)",
                        fontFamily: "var(--code-font-family)",
                        fontSize: 11,
                        lineHeight: "22px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                      }}
                    >
                      {entryLabel}
                    </Text>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </Flex>
        </motion.div>
      )}
    </Flex>
  );
}
