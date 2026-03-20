import type { SignalReport, SignalReportOrderingField } from "@shared/types";

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

/**
 * Comma-separated `ordering` for the signal report list API: stage (`pipeline`) then
 * the toolbar field (matches default inbox UX).
 */
export function buildSignalReportListOrdering(
  field: SignalReportOrderingField,
  direction: "asc" | "desc",
): string {
  const secondary = direction === "desc" ? `-${field}` : field;
  return `pipeline,${secondary}`;
}
