import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import { inboxStatusLabel } from "@features/inbox/utils/inboxSort";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import type { DismissalReason } from "@shared/dismissalReasons";
import type { SignalReport } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

interface SuppressDismissal {
  reason: DismissalReason;
  note: string;
}

type BulkActionName = "suppress" | "snooze" | "delete" | "reingest";

interface BulkActionResult {
  successCount: number;
  failureCount: number;
}

const inboxQueryKey = ["inbox", "signal-reports"] as const;

/** Only these reports may be dismissed (suppressed) from the inbox. */
const suppressibleStatuses = new Set<SignalReport["status"]>([
  "failed",
  "pending_input",
  "ready",
]);

const snoozableStatuses = new Set<SignalReport["status"]>([
  "in_progress",
  "ready",
  "pending_input",
]);

/** Clause after "Disabled because …" (see `@components/ui/Button`). */
const DISABLED_NO_SELECTION = "you haven't selected a report";

/** Matches labels in the inbox list/filter (`inboxStatusLabel`). */
const SNOOZE_ALLOWED_STATUS_PHRASE = (
  [
    "in_progress",
    "ready",
    "pending_input",
  ] as const satisfies readonly SignalReport["status"][]
)
  .map((status) => inboxStatusLabel(status))
  .join(" or ");

/** Matches labels in the inbox list/filter (`inboxStatusLabel`). */
const SUPPRESS_ALLOWED_STATUS_PHRASE = (
  [
    "failed",
    "pending_input",
    "ready",
  ] as const satisfies readonly SignalReport["status"][]
)
  .map((status) => inboxStatusLabel(status))
  .join(" or ");

type SelectedReportEligibility = {
  selectedReports: SignalReport[];
  selectedIds: string[];
  selectedCount: number;
  snoozeDisabledReason: string | null;
  suppressDisabledReason: string | null;
  deleteDisabledReason: string | null;
  reingestDisabledReason: string | null;
};

function formatBulkActionSummary(
  action: BulkActionName,
  result: BulkActionResult,
): string {
  const { successCount, failureCount } = result;
  const pluralized = successCount === 1 ? "report" : "reports";
  const formulated =
    action === "suppress"
      ? `${pluralized} dismissed`
      : action === "snooze"
        ? `${pluralized} snoozed`
        : action === "delete"
          ? `${pluralized} deleted`
          : `${pluralized} reingested`;
  if (failureCount === 0) {
    return `${successCount} ${formulated}`;
  }
  return `${successCount} ${formulated}, ${failureCount} failed`;
}

function getSnoozeDisabledReason(
  selectedCount: number,
  selectedReports: SignalReport[],
): string | null {
  if (selectedCount === 0) {
    return DISABLED_NO_SELECTION;
  }
  const ok = selectedReports.every((report) =>
    snoozableStatuses.has(report.status),
  );
  if (ok) {
    return null;
  }
  return `every selected report must be ${SNOOZE_ALLOWED_STATUS_PHRASE} to snooze`;
}

function getSuppressDisabledReason(
  selectedCount: number,
  selectedReports: SignalReport[],
): string | null {
  if (selectedCount === 0) {
    return DISABLED_NO_SELECTION;
  }
  const ok = selectedReports.every((report) =>
    suppressibleStatuses.has(report.status),
  );
  if (ok) {
    return null;
  }
  return `every selected report must be ${SUPPRESS_ALLOWED_STATUS_PHRASE} to suppress`;
}

function getSelectedReportEligibility(
  reports: SignalReport[],
  selectedIds: string[],
): SelectedReportEligibility {
  const selectedIdSet = new Set(selectedIds);
  const selectedReports = reports.filter((report) =>
    selectedIdSet.has(report.id),
  );
  const selectedCount = selectedReports.length;

  return {
    selectedReports,
    selectedIds: selectedReports.map((report) => report.id),
    selectedCount,
    snoozeDisabledReason: getSnoozeDisabledReason(
      selectedCount,
      selectedReports,
    ),
    suppressDisabledReason: getSuppressDisabledReason(
      selectedCount,
      selectedReports,
    ),
    deleteDisabledReason: selectedCount === 0 ? DISABLED_NO_SELECTION : null,
    reingestDisabledReason: selectedCount === 0 ? DISABLED_NO_SELECTION : null,
  };
}

/** Snooze disabled reason when `selectedIds` are treated as the bulk selection (matches toolbar logic). */
export function inboxBulkSnoozeDisabledReason(
  reports: SignalReport[],
  selectedIds: string[],
): string | null {
  return getSelectedReportEligibility(reports, selectedIds)
    .snoozeDisabledReason;
}

/** Suppress/dismiss disabled reason when `selectedIds` are treated as the bulk selection. */
export function inboxBulkSuppressDisabledReason(
  reports: SignalReport[],
  selectedIds: string[],
): string | null {
  return getSelectedReportEligibility(reports, selectedIds)
    .suppressDisabledReason;
}

export function useInboxBulkActions(
  reports: SignalReport[],
  effectiveBulkIds: string[],
) {
  const queryClient = useQueryClient();
  const clearSelection = useInboxReportSelectionStore(
    (state) => state.clearSelection,
  );

  const eligibility = useMemo(
    () => getSelectedReportEligibility(reports, effectiveBulkIds),
    [reports, effectiveBulkIds],
  );

  const invalidateInboxQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: inboxQueryKey,
      exact: false,
    });
  }, [queryClient]);

  const suppressMutation = useAuthenticatedMutation(
    async (
      client,
      input: { reportIds: string[]; dismissal?: SuppressDismissal },
    ) => {
      const results = await Promise.allSettled(
        input.reportIds.map((reportId) =>
          client.updateSignalReportState(reportId, {
            state: "suppressed",
            ...(input.dismissal
              ? {
                  dismissal_reason: input.dismissal.reason,
                  dismissal_note: input.dismissal.note,
                }
              : {}),
          }),
        ),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;

      return {
        successCount,
        failureCount: results.length - successCount,
      };
    },
    {
      onSuccess: async (result) => {
        await invalidateInboxQueries();
        clearSelection();

        if (result.failureCount > 0) {
          toast.error(formatBulkActionSummary("suppress", result));
          return;
        }

        toast.success(formatBulkActionSummary("suppress", result));
      },
      onError: (error) => {
        toast.error(error.message || "Failed to dismiss reports");
      },
    },
  );

  const snoozeMutation = useAuthenticatedMutation(
    async (client, reportIds: string[]) => {
      const results = await Promise.allSettled(
        reportIds.map((reportId) =>
          client.updateSignalReportState(reportId, {
            state: "potential",
            snooze_for: 1,
          }),
        ),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;

      return {
        successCount,
        failureCount: results.length - successCount,
      };
    },
    {
      onSuccess: async (result) => {
        await invalidateInboxQueries();
        clearSelection();

        if (result.failureCount > 0) {
          toast.error(formatBulkActionSummary("snooze", result));
          return;
        }

        toast.success(formatBulkActionSummary("snooze", result));
      },
      onError: (error) => {
        toast.error(error.message || "Failed to snooze reports");
      },
    },
  );

  const deleteMutation = useAuthenticatedMutation(
    async (client, reportIds: string[]) => {
      const results = await Promise.allSettled(
        reportIds.map((reportId) => client.deleteSignalReport(reportId)),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;

      return {
        successCount,
        failureCount: results.length - successCount,
      };
    },
    {
      onSuccess: async (result) => {
        await invalidateInboxQueries();
        clearSelection();

        if (result.failureCount > 0) {
          toast.error(formatBulkActionSummary("delete", result));
          return;
        }

        toast.success(formatBulkActionSummary("delete", result));
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete reports");
      },
    },
  );

  const reingestMutation = useAuthenticatedMutation(
    async (client, reportIds: string[]) => {
      const results = await Promise.allSettled(
        reportIds.map((reportId) => client.reingestSignalReport(reportId)),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;

      return {
        successCount,
        failureCount: results.length - successCount,
      };
    },
    {
      onSuccess: async (result) => {
        await invalidateInboxQueries();
        clearSelection();

        if (result.failureCount > 0) {
          toast.error(formatBulkActionSummary("reingest", result));
          return;
        }

        toast.success(formatBulkActionSummary("reingest", result));
      },
      onError: (error) => {
        toast.error(error.message || "Failed to reingest reports");
      },
    },
  );

  const suppressSelected = useCallback(
    async (dismissal?: SuppressDismissal) => {
      if (eligibility.suppressDisabledReason !== null) {
        return false;
      }

      await suppressMutation.mutateAsync({
        reportIds: eligibility.selectedIds,
        dismissal,
      });
      return true;
    },
    [
      eligibility.suppressDisabledReason,
      eligibility.selectedIds,
      suppressMutation,
    ],
  );

  const snoozeSelected = useCallback(async () => {
    if (eligibility.snoozeDisabledReason !== null) {
      return false;
    }

    await snoozeMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [
    eligibility.snoozeDisabledReason,
    eligibility.selectedIds,
    snoozeMutation,
  ]);

  const deleteSelected = useCallback(async () => {
    if (eligibility.deleteDisabledReason !== null) {
      return false;
    }

    await deleteMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [
    deleteMutation,
    eligibility.deleteDisabledReason,
    eligibility.selectedIds,
  ]);

  const reingestSelected = useCallback(async () => {
    if (eligibility.reingestDisabledReason !== null) {
      return false;
    }

    await reingestMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [
    eligibility.reingestDisabledReason,
    eligibility.selectedIds,
    reingestMutation,
  ]);

  return {
    selectedReports: eligibility.selectedReports,
    selectedCount: eligibility.selectedCount,
    snoozeDisabledReason: eligibility.snoozeDisabledReason,
    suppressDisabledReason: eligibility.suppressDisabledReason,
    deleteDisabledReason: eligibility.deleteDisabledReason,
    reingestDisabledReason: eligibility.reingestDisabledReason,
    isSuppressing: suppressMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReingesting: reingestMutation.isPending,
    suppressSelected,
    snoozeSelected,
    deleteSelected,
    reingestSelected,
  };
}
