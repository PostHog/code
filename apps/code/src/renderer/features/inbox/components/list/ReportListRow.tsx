import { SignalReportPriorityBadge } from "@features/inbox/components/utils/SignalReportPriorityBadge";
import { SignalReportStatusBadge } from "@features/inbox/components/utils/SignalReportStatusBadge";
import { SignalReportSummaryMarkdown } from "@features/inbox/components/utils/SignalReportSummaryMarkdown";
import { SOURCE_PRODUCT_META } from "@features/inbox/components/utils/source-product-icons";
import { EyeIcon } from "@phosphor-icons/react";
import { Checkbox, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { motion } from "framer-motion";
import type { KeyboardEvent, MouseEvent } from "react";

interface ReportListRowProps {
  report: SignalReport;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onToggleChecked: () => void;
  index: number;
}

export function ReportListRow({
  report,
  isSelected,
  isChecked,
  onClick,
  onToggleChecked,
  index,
}: ReportListRowProps) {
  const updatedAtLabel = new Date(report.updated_at).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );

  const isReady = report.status === "ready";

  const isInteractiveTarget = (target: EventTarget | null): boolean => {
    return (
      target instanceof HTMLElement &&
      !!target.closest("a, button, input, select, textarea, [role='checkbox']")
    );
  };

  const handleActivate = (e: MouseEvent | KeyboardEvent): void => {
    if (isInteractiveTarget(e.target)) {
      return;
    }
    onClick();
  };

  const handleToggleChecked = (e: MouseEvent | KeyboardEvent): void => {
    e.stopPropagation();
    onToggleChecked();
  };

  const rowBgClass = isSelected
    ? "bg-gray-3"
    : isChecked
      ? "bg-gray-2"
      : report.is_suggested_reviewer
        ? "bg-blue-2"
        : "";

  return (
    <motion.div
      role="button"
      tabIndex={-1}
      data-report-id={report.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        delay: Math.min(index * 0.035, 0.35),
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={handleActivate}
      onKeyDown={(e: KeyboardEvent) => {
        if (isInteractiveTarget(e.target)) {
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          handleActivate(e);
        } else if (e.key === " ") {
          e.preventDefault();
          handleToggleChecked(e);
        }
      }}
      className={[
        "relative isolate w-full cursor-pointer overflow-hidden border-gray-5 border-b py-2 pr-3 pl-2 text-left",
        "before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-gray-12 before:opacity-0 hover:before:opacity-[0.07]",
        rowBgClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Flex align="start" justify="between" gap="3" className="relative z-[2]">
        <Flex align="start" gap="2" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" justify="center" className="shrink-0 pt-0.5">
            <Checkbox
              size="1"
              checked={isChecked}
              className="mt-0.5"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onCheckedChange={() => onToggleChecked()}
              aria-label={
                isChecked
                  ? "Unselect report from bulk actions"
                  : "Select report for bulk actions"
              }
            />
          </Flex>

          <Flex direction="column" gap="0.5" style={{ minWidth: 0, flex: 1 }}>
            <Flex align="start" gapX="2" className="min-w-0">
              {(report.source_products ?? []).length > 0 && (
                <Flex
                  direction="column"
                  align="center"
                  gap="0.5"
                  className="shrink-0 pt-1"
                >
                  {(report.source_products ?? []).map((sp) => {
                    const meta = SOURCE_PRODUCT_META[sp];
                    if (!meta) return null;
                    const { Icon } = meta;
                    return (
                      <span key={sp} style={{ color: meta.color }}>
                        <Icon size={12} />
                      </span>
                    );
                  })}
                </Flex>
              )}

              <Flex
                align="center"
                gapX="2"
                wrap="wrap"
                className="min-w-0 flex-1"
              >
                <Text
                  size="1"
                  weight="medium"
                  className="min-w-0 flex-1 basis-0 select-text truncate text-[13px]"
                >
                  {report.title ?? "Untitled signal"}
                </Text>
                <SignalReportStatusBadge status={report.status} />
                <SignalReportPriorityBadge priority={report.priority} />
                {report.is_suggested_reviewer && (
                  <Tooltip content="You are a suggested reviewer">
                    <span
                      className="inline-flex shrink-0 items-center rounded-sm px-1 py-px"
                      style={{
                        color: "var(--blue-11)",
                        backgroundColor: "var(--blue-3)",
                        border: "1px solid var(--blue-6)",
                      }}
                    >
                      <EyeIcon size={10} weight="bold" />
                    </span>
                  </Tooltip>
                )}
              </Flex>
            </Flex>

            <div
              className="min-w-0 select-text"
              style={{ opacity: isReady ? 1 : 0.82 }}
            >
              <SignalReportSummaryMarkdown
                content={report.summary}
                fallback="No summary yet — still collecting context."
                variant="list"
                pending={!isReady}
              />
            </div>
          </Flex>
        </Flex>

        <Flex direction="column" align="end" gap="1" className="shrink-0">
          <Text size="1" color="gray" className="text-[12px]">
            {updatedAtLabel}
          </Text>
        </Flex>
      </Flex>
    </motion.div>
  );
}
