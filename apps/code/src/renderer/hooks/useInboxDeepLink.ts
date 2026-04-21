import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { trpcClient, useTRPC } from "@renderer/trpc";
import type { SignalReport } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { logger } from "@utils/logger";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const log = logger.scope("inbox-deep-link");

// Keep in sync with the key in features/inbox/hooks/useInboxReports.ts (`reportKeys.detail`).
const reportDetailKey = (reportId: string) =>
  ["inbox", "signal-reports", reportId, "detail"] as const;

/**
 * Hook that subscribes to inbox report deep link events (posthog-code://inbox/{reportId})
 * and opens the report in the inbox view.
 *
 * Behavior on link arrival:
 * 1. Reset inbox-local filters so the linked report isn't hidden.
 * 2. Navigate to the inbox view.
 * 3. Fetch the report by id directly, bypassing the paginated list, and seed
 *    the TanStack Query cache so the detail pane fallback reuses it.
 *    - On 404/403 (wrong team / deleted / suppressed): toast "Report not found
 *      in the current team" and clear selection.
 *    - On success: set selection to the report id.
 */
export function useInboxDeepLink() {
  const trpcReact = useTRPC();
  const navigateToInbox = useNavigationStore((state) => state.navigateToInbox);
  const setSelectedReportIds = useInboxReportSelectionStore(
    (state) => state.setSelectedReportIds,
  );
  const clearSelection = useInboxReportSelectionStore(
    (state) => state.clearSelection,
  );
  const resetFilters = useInboxSignalsFilterStore(
    (state) => state.resetFilters,
  );
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStateValue(
    (state) => state.status === "authenticated",
  );
  const client = useOptionalAuthenticatedClient();
  const hasFetchedPending = useRef(false);

  const handleOpenReport = useCallback(
    async (reportId: string) => {
      log.info(`Opening report from deep link: ${reportId}`);

      if (!client) {
        log.warn("Ignoring inbox deep link — not authenticated");
        return;
      }

      resetFilters();
      navigateToInbox();

      try {
        const report = await queryClient.fetchQuery<SignalReport | null>({
          queryKey: reportDetailKey(reportId),
          queryFn: () => client.getSignalReport(reportId),
        });

        if (!report) {
          log.warn(`Report not found or not accessible: ${reportId}`);
          toast.error("Report not found in the current team");
          clearSelection();
          return;
        }

        setSelectedReportIds([report.id]);
        log.info(`Successfully opened report from deep link: ${report.id}`);
      } catch (error) {
        log.error("Unexpected error opening report from deep link:", error);
        toast.error("Failed to open report");
        clearSelection();
      }
    },
    [
      navigateToInbox,
      setSelectedReportIds,
      clearSelection,
      resetFilters,
      queryClient,
      client,
    ],
  );

  // Cold start: drain pending deep link that arrived before renderer was ready.
  useEffect(() => {
    if (!isAuthenticated || hasFetchedPending.current) return;

    const fetchPending = async () => {
      hasFetchedPending.current = true;
      try {
        const pending = await trpcClient.deepLink.getPendingReportLink.query();
        if (pending) {
          log.info(
            `Found pending inbox deep link: reportId=${pending.reportId}`,
          );
          handleOpenReport(pending.reportId);
        }
      } catch (error) {
        log.error("Failed to check for pending inbox deep link:", error);
      }
    };

    fetchPending();
  }, [isAuthenticated, handleOpenReport]);

  // Warm start: receive deep link events while the renderer is running.
  useSubscription(
    trpcReact.deepLink.onOpenReport.subscriptionOptions(undefined, {
      onData: (data) => {
        log.info(`Received inbox deep link event: reportId=${data.reportId}`);
        if (!data?.reportId) return;
        handleOpenReport(data.reportId);
      },
    }),
  );
}
