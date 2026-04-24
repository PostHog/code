import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Brain,
  CheckCircle,
  FileText,
  Globe,
  MagnifyingGlass,
  PencilSimple,
  Terminal,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";

interface ActivityEntry {
  id: number;
  toolCallId: string;
  tool: string;
  filePath: string | null;
  title: string;
}

interface SetupScanFeedProps {
  label: string;
  icon: Icon;
  color: string;
  currentTool: string | null;
  recentEntries: ActivityEntry[];
  isDone: boolean;
  doneLabel?: string;
}

const TOOL_VERBS: Record<string, string> = {
  Read: "Reading a file...",
  Glob: "Searching files...",
  Grep: "Searching code...",
  Bash: "Running a command...",
  Edit: "Making changes...",
  Write: "Writing a file...",
  Agent: "Thinking...",
  ListDirectory: "Browsing files...",
  ToolSearch: "Looking up tools...",
  WebSearch: "Searching the web...",
  WebFetch: "Fetching a page...",
  NotebookEdit: "Editing notebook...",
  Monitor: "Monitoring...",
  SearchReplace: "Making changes...",
  MultiEdit: "Making changes...",
  StructuredOutput: "Preparing results...",
  create_output: "Preparing results...",
  TodoRead: "Reviewing tasks...",
  TodoWrite: "Updating tasks...",
  TaskCreate: "Creating a task...",
  TaskUpdate: "Updating a task...",
  TaskGet: "Checking task status...",
  TaskList: "Listing tasks...",
  AskFollowupQuestion: "Thinking...",
};

const TOOL_KIND: Record<string, string> = {
  Read: "read",
  Edit: "edit",
  Write: "edit",
  Grep: "search",
  Glob: "search",
  Bash: "execute",
  Agent: "think",
  ToolSearch: "search",
  WebSearch: "search",
  WebFetch: "fetch",
  StructuredOutput: "other",
  create_output: "other",
};

const KIND_ICONS: Record<string, Icon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: ArrowsLeftRight,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  other: Wrench,
};

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

const GENERIC_TITLES = new Set([
  "Read File",
  "Execute command",
  "Edit",
  "Write",
  "Find",
  "Fetch",
  "Working",
  "Task",
  "Terminal",
]);

function entryDisplayText(entry: ActivityEntry): string {
  if (entry.filePath) return shortenPath(entry.filePath);
  if (entry.title && !GENERIC_TITLES.has(entry.title)) return entry.title;
  return TOOL_VERBS[entry.tool] ?? "Working...";
}

function toolLabel(tool: string): string {
  return TOOL_VERBS[tool] ?? "Working...";
}

export function SetupScanFeed({
  label,
  icon: LabelIcon,
  color,
  currentTool,
  recentEntries,
  isDone,
  doneLabel = "Complete",
}: SetupScanFeedProps) {
  const activeLabel = currentTool ? toolLabel(currentTool) : "Starting...";

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
          borderRadius: 12,
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
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
                <DotsCircleSpinner size={14} className="text-[var(--gray-9)]" />
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
                <Text
                  size="1"
                  weight="medium"
                  style={{ color: "var(--gray-11)" }}
                >
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
          transition={{
            height: { duration: 0.3, ease: "easeOut" },
            opacity: { duration: 0.2 },
          }}
          style={{ overflow: "hidden" }}
        >
          <Flex
            direction="column"
            gap="0"
            px="3"
            py="2"
            mx="4"
            style={{
              backgroundColor: "var(--gray-2)",
              borderRadius: "0 0 10px 10px",
              maxHeight: 120,
              overflow: "hidden",
            }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {recentEntries.slice(-4).map((entry, index, arr) => {
                const isLatest = index === arr.length - 1;
                const kind = TOOL_KIND[entry.tool] ?? "other";
                const EntryIcon = KIND_ICONS[kind] ?? Wrench;
                const entryText = entryDisplayText(entry);
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: isLatest ? 1 : 0.45, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{
                      duration: 0.2,
                      layout: { type: "spring", damping: 25, stiffness: 300 },
                    }}
                  >
                    <Flex align="center" gap="2" style={{ height: 24 }}>
                      <EntryIcon
                        size={12}
                        weight="regular"
                        color="var(--gray-9)"
                        style={{ flexShrink: 0 }}
                      />
                      <Text
                        size="1"
                        style={{
                          color: "var(--gray-9)",
                          fontFamily: "var(--code-font-family)",
                          fontSize: 11,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {entryText}
                      </Text>
                    </Flex>
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
