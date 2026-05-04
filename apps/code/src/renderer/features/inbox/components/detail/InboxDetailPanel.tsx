import { useInboxDetailPanelStore } from "@features/inbox/stores/inboxDetailPanelStore";
import { isPrReport } from "@features/inbox/utils/inboxItemClassification";
import type { SignalReport } from "@shared/types";
import { useCallback, useEffect, useRef } from "react";
import { PrDetailView } from "./PrDetailView";
import { ReportDetailPane } from "./ReportDetailPane";

interface InboxDetailPanelProps {
  report: SignalReport;
  onClose: () => void;
  onDismiss: (id: string) => void;
}

export function InboxDetailPanel({
  report,
  onClose,
  onDismiss,
}: InboxDetailPanelProps) {
  const width = useInboxDetailPanelStore((s) => s.width);
  const isResizing = useInboxDetailPanelStore((s) => s.isResizing);
  const setWidth = useInboxDetailPanelStore((s) => s.setWidth);
  const setIsResizing = useInboxDetailPanelStore((s) => s.setIsResizing);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't close if a dialog/popover is open
        if (
          document.querySelector(
            "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']",
          )
        ) {
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Resize handler
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [setIsResizing],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      const containerRight =
        panelRef.current.parentElement?.getBoundingClientRect().right ?? 0;
      const newWidth = Math.max(360, Math.min(800, containerRight - e.clientX));
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      // Reset body styles in case the component unmounts mid-resize
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setWidth, setIsResizing]);

  const isPr = isPrReport(report);

  return (
    <div
      ref={panelRef}
      className="relative flex h-full shrink-0 flex-col border-l border-l-(--gray-5)"
      style={{ width: `min(${width}px, 60%)` }}
    >
      {/* Resize handle — subtle hover affordance */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize drag handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 bottom-0 left-0 z-10 w-[4px] cursor-col-resize bg-transparent hover:bg-(--gray-4) active:bg-(--gray-5)"
      />

      {/* Content */}
      {isPr ? (
        <PrDetailView
          report={report}
          onClose={onClose}
          onDismiss={() => onDismiss(report.id)}
        />
      ) : (
        <ReportDetailPane report={report} onClose={onClose} />
      )}
    </div>
  );
}
