import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import type { SignalReport } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

type BulkActionName = "suppress" | "snooze" | "delete" | "reingest";

interface BulkActionResult {
  successCount: number;
  failureCount: number;
}

const inboxQueryKey = ["inbox", "signal-reports"] as const;

const suppressibleStatuses = new Set<SignalReport["status"]>([
  "potential",
  "candidate",
  "in_progress",
  "pending_input",
  "ready",
  "failed",
]);

const snoozableStatuses = new Set<SignalReport["status"]>([
  "in_progress",
  "ready",
]);

type SelectedReportEligibility = {
  selectedReports: SignalReport[];
  selectedIds: string[];
  selectedCount: number;
  canSuppress: boolean;
  canSnooze: boolean;
  canDelete: boolean;
  canReingest: boolean;
};

function formatBulkActionSummary(
  action: BulkActionName,
  result: BulkActionResult,
): string {
  const { successCount, failureCount } = result;
  const noun =
    action === "suppress"
      ? "report suppressed"
      : action === "snooze"
        ? "report snoozed"
        : action === "delete"
          ? "report deleted"
          : "report reingested";

  const pluralized = successCount === 1 ? noun : `${noun}s`;

  if (failureCount === 0) {
    return `${successCount} ${pluralized}`;
  }

  return `${successCount} ${pluralized}, ${failureCount} failed`;
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
    canSuppress:
      selectedCount > 0 &&
      selectedReports.every((report) =>
        suppressibleStatuses.has(report.status),
      ),
    canSnooze:
      selectedCount > 0 &&
      selectedReports.every((report) => snoozableStatuses.has(report.status)),
    canDelete: selectedCount > 0,
    canReingest: selectedCount > 0,
  };
}

export function useInboxBulkActions(reports: SignalReport[]) {
  const queryClient = useQueryClient();
  const selectedReportIds = useInboxReportSelectionStore(
    (state) => state.selectedReportIds ?? [],
  );
  const clearSelection = useInboxReportSelectionStore(
    (state) => state.clearSelection,
  );

  const eligibility = useMemo(
    () => getSelectedReportEligibility(reports, selectedReportIds),
    [reports, selectedReportIds],
  );

  const invalidateInboxQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: inboxQueryKey,
      exact: false,
    });
  }, [queryClient]);

  const suppressMutation = useAuthenticatedMutation(
    async (client, reportIds: string[]) => {
      const results = await Promise.allSettled(
        reportIds.map((reportId) =>
          client.updateSignalReportState(reportId, { state: "suppressed" }),
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
        toast.error(error.message || "Failed to suppress reports");
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

  const suppressSelected = useCallback(async () => {
    if (!eligibility.canSuppress) {
      return false;
    }

    await suppressMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [eligibility.canSuppress, eligibility.selectedIds, suppressMutation]);

  const snoozeSelected = useCallback(async () => {
    if (!eligibility.canSnooze) {
      return false;
    }

    await snoozeMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [eligibility.canSnooze, eligibility.selectedIds, snoozeMutation]);

  const deleteSelected = useCallback(async () => {
    if (!eligibility.canDelete) {
      return false;
    }

    await deleteMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [deleteMutation, eligibility.canDelete, eligibility.selectedIds]);

  const reingestSelected = useCallback(async () => {
    if (!eligibility.canReingest) {
      return false;
    }

    await reingestMutation.mutateAsync(eligibility.selectedIds);
    return true;
  }, [eligibility.canReingest, eligibility.selectedIds, reingestMutation]);

  return {
    selectedReports: eligibility.selectedReports,
    selectedCount: eligibility.selectedCount,
    canSuppress: eligibility.canSuppress,
    canSnooze: eligibility.canSnooze,
    canDelete: eligibility.canDelete,
    canReingest: eligibility.canReingest,
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
