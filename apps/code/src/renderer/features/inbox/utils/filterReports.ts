import type {
  SignalReport,
  SignalReportOrderingField,
  SignalReportsQueryParams,
} from "@shared/types";

export function filterReportsBySearch(
  reports: SignalReport[],
  query: string,
): SignalReport[] {
  const trimmed = query.trim();
  if (!trimmed) return reports;

  const lower = trimmed.toLowerCase();
  return reports.filter(
    (report) =>
      report.title?.toLowerCase().includes(lower) ||
      report.summary?.toLowerCase().includes(lower),
  );
}

export function buildOrdering(
  field: SignalReportOrderingField,
  direction: "asc" | "desc",
): SignalReportsQueryParams["ordering"] {
  return (
    direction === "desc" ? `-${field}` : field
  ) as SignalReportsQueryParams["ordering"];
}
