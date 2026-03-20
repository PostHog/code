import type {
  SignalReport,
  SignalReportOrderingField,
  SignalReportStatus,
} from "@shared/types";

const STATUS_RANK: Record<string, number> = {
  ready: 0,
  pending_input: 1,
  in_progress: 2,
  candidate: 3,
  potential: 4,
  failed: 5,
  suppressed: 6,
  deleted: 7,
};

function statusRank(status: SignalReportStatus): number {
  return STATUS_RANK[status] ?? 50;
}

function compareField(
  a: SignalReport,
  b: SignalReport,
  field: SignalReportOrderingField,
  direction: "asc" | "desc",
): number {
  const mul = direction === "desc" ? -1 : 1;
  const va = getComparable(a, field);
  const vb = getComparable(b, field);
  if (va < vb) return -1 * mul;
  if (va > vb) return 1 * mul;
  return a.id.localeCompare(b.id);
}

function getComparable(
  r: SignalReport,
  field: SignalReportOrderingField,
): number | string {
  switch (field) {
    case "signal_count":
      return r.signal_count;
    case "total_weight":
      return r.total_weight;
    case "created_at":
      return r.created_at;
    case "updated_at":
      return r.updated_at;
    default:
      return r.updated_at;
  }
}

/**
 * Primary: actionable / pipeline stage. Secondary: user sort from toolbar.
 */
export function sortInboxPipelineReports(
  reports: SignalReport[],
  field: SignalReportOrderingField,
  direction: "asc" | "desc",
): SignalReport[] {
  return [...reports].sort((a, b) => {
    const dr = statusRank(a.status) - statusRank(b.status);
    if (dr !== 0) return dr;
    return compareField(a, b, field, direction);
  });
}

export function inboxStatusLabel(status: SignalReportStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "pending_input":
      return "Needs input";
    case "in_progress":
      return "Researching";
    case "candidate":
      return "Queued";
    case "potential":
      return "Gathering";
    case "failed":
      return "Failed";
    case "suppressed":
      return "Suppressed";
    case "deleted":
      return "Deleted";
    default:
      return status;
  }
}

export function inboxStatusAccentCss(status: SignalReportStatus): string {
  switch (status) {
    case "ready":
      return "var(--green-9)";
    case "pending_input":
      return "var(--violet-9)";
    case "in_progress":
      return "var(--amber-9)";
    case "candidate":
      return "var(--cyan-9)";
    case "potential":
      return "var(--gray-9)";
    case "failed":
      return "var(--red-9)";
    default:
      return "var(--gray-8)";
  }
}

export function isReportActionable(status: SignalReportStatus): boolean {
  return status === "ready";
}
