import { ReportCardContent } from "@features/inbox/components/utils/ReportCardContent";
import { FileTextIcon } from "@phosphor-icons/react";
import { Checkbox, Flex } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { motion } from "framer-motion";
import type { KeyboardEvent, MouseEvent } from "react";

interface ReportListRowProps {
  report: SignalReport;
  isSelected: boolean;
  showCheckbox: boolean;
  onClick: (event: { metaKey: boolean; shiftKey: boolean }) => void;
  onToggleChecked: () => void;
  index: number;
}

export function ReportListRow({
  report,
  isSelected,
  showCheckbox,
  onClick,
  onToggleChecked,
  index,
}: ReportListRowProps) {
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
    onClick({ metaKey: e.metaKey, shiftKey: e.shiftKey });
  };

  const rowBgClass = isSelected
    ? "bg-gray-3"
    : report.is_suggested_reviewer
      ? "bg-amber-2"
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
      <Flex align="start" gap="2" className="relative z-[2]">
        <Flex
          align="center"
          justify="center"
          className="shrink-0 pt-1"
          style={{ width: 16, minWidth: 16 }}
        >
          {showCheckbox ? (
            <Checkbox
              size="1"
              checked={isSelected}
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onCheckedChange={() => onToggleChecked()}
              aria-label={
                isSelected
                  ? "Unselect report from bulk actions"
                  : "Select report for bulk actions"
              }
            />
          ) : (
            <span className="text-gray-8">
              <FileTextIcon size={14} />
            </span>
          )}
        </Flex>
        <div className="min-w-0 flex-1">
          <ReportCardContent report={report} />
        </div>
      </Flex>
    </motion.div>
  );
}
