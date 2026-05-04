import { useInboxViewStore } from "@features/inbox/stores/inboxViewStore";
import type { PartitionedInboxItems } from "@features/inbox/utils/inboxItemClassification";
import { REPORT_SECTION_ORDER } from "@features/inbox/utils/inboxItemClassification";
import { ScrollArea } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { track } from "@utils/analytics";
import { useCallback, useEffect, useState } from "react";
import { DismissDialog } from "./DismissDialog";
import { InboxDetailPanel } from "./detail/InboxDetailPanel";
import { FilterEmptyState, TabEmptyState } from "./InboxEmptyState";
import { PrListSection } from "./pr/PrListSection";
import { ReportSection } from "./report/ReportSection";

interface InboxListProps {
  items: PartitionedInboxItems;
  allReports: SignalReport[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function InboxList({
  items,
  allReports,
  hasActiveFilters,
  onClearFilters,
}: InboxListProps) {
  const activeTab = useInboxViewStore((s) => s.activeTab);
  const dismiss = useInboxViewStore((s) => s.dismiss);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissTargetId, setDismissTargetId] = useState<string | null>(null);

  const selectedReport = selectedId
    ? (allReports.find((r) => r.id === selectedId) ?? null)
    : null;

  // Clear stale selection when the selected item leaves the list (scope change, refetch, tab switch)
  useEffect(() => {
    if (selectedId && !selectedReport) {
      setSelectedId(null);
    }
  }, [selectedId, selectedReport]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleDismissClick = useCallback((id: string) => {
    setDismissTargetId(id);
  }, []);

  const handleDismissConfirm = useCallback(
    (reason: string, note: string) => {
      if (dismissTargetId) {
        dismiss(dismissTargetId);
        track(ANALYTICS_EVENTS.INBOX_REPORT_DISMISSED, {
          report_id: dismissTargetId,
          reason,
          note: note || undefined,
        });
        if (selectedId === dismissTargetId) {
          setSelectedId(null);
        }
      }
      setDismissTargetId(null);
    },
    [dismissTargetId, dismiss, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* List area */}
      <div className="min-w-0 flex-1">
        <ScrollArea type="auto" scrollbars="vertical" className="h-full">
          {activeTab === "pull-requests" && (
            <div className="pt-2 pb-5">
              {items.prCount === 0 ? (
                hasActiveFilters ? (
                  <FilterEmptyState onClearFilters={onClearFilters} />
                ) : (
                  <TabEmptyState tab="pull-requests" />
                )
              ) : (
                <>
                  <PrListSection
                    kind="ready"
                    reports={items.prReports.ready}
                    selectedId={selectedId}
                    onRowClick={handleRowClick}
                    onDismiss={handleDismissClick}
                  />
                  <PrListSection
                    kind="review"
                    reports={items.prReports.review}
                    selectedId={selectedId}
                    onRowClick={handleRowClick}
                    onDismiss={handleDismissClick}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "reports" && (
            <div className="pt-2 pb-5">
              {REPORT_SECTION_ORDER.map((sectionKey) => {
                const sectionReports = items.reportsBySection[sectionKey];
                if (sectionReports.length === 0) return null;
                return (
                  <ReportSection
                    key={sectionKey}
                    sectionKey={sectionKey}
                    reports={sectionReports}
                    selectedId={selectedId}
                    onCardClick={handleRowClick}
                    onDismiss={handleDismissClick}
                  />
                );
              })}

              {/* Empty state for reports tab */}
              {items.reportCount === 0 &&
                (hasActiveFilters ? (
                  <FilterEmptyState onClearFilters={onClearFilters} />
                ) : (
                  <TabEmptyState tab="reports" />
                ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detail panel */}
      {selectedReport && (
        <InboxDetailPanel
          report={selectedReport}
          onClose={handleClose}
          onDismiss={handleDismissClick}
        />
      )}

      {/* Dismiss dialog */}
      <DismissDialog
        open={dismissTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDismissTargetId(null);
        }}
        onConfirm={handleDismissConfirm}
      />
    </div>
  );
}
