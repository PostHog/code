import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type {
  SignalReportArtefactsResponse,
  SignalReportSignalsResponse,
  SignalReportsQueryParams,
  SignalReportsResponse,
} from "@shared/types";

const reportKeys = {
  all: ["inbox", "signal-reports"] as const,
  list: (params?: SignalReportsQueryParams) =>
    [...reportKeys.all, "list", params ?? {}] as const,
  artefacts: (reportId: string) =>
    [...reportKeys.all, reportId, "artefacts"] as const,
  signals: (reportId: string) =>
    [...reportKeys.all, reportId, "signals"] as const,
};

export function useInboxReports(
  params?: SignalReportsQueryParams,
  options?: { enabled?: boolean },
) {
  return useAuthenticatedQuery<SignalReportsResponse>(
    reportKeys.list(params),
    (client) => client.getSignalReports(params),
    options,
  );
}

export function useInboxReportArtefacts(
  reportId: string,
  options?: { enabled?: boolean },
) {
  return useAuthenticatedQuery<SignalReportArtefactsResponse>(
    reportKeys.artefacts(reportId),
    (client) => client.getSignalReportArtefacts(reportId),
    { enabled: !!reportId && (options?.enabled ?? true) },
  );
}

export function useInboxReportSignals(
  reportId: string,
  options?: { enabled?: boolean },
) {
  return useAuthenticatedQuery<SignalReportSignalsResponse>(
    reportKeys.signals(reportId),
    (client) => client.getSignalReportSignals(reportId),
    { enabled: !!reportId && (options?.enabled ?? true) },
  );
}
