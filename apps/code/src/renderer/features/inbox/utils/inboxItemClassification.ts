import type { SignalReport } from "@shared/types";

export type PrReadiness = "ready" | "review";

export type ReportSectionKey =
  | "researching"
  | "needs-input"
  | "ready"
  | "failed"
  | "non-actionable";

export const REPORT_SECTION_ORDER: ReportSectionKey[] = [
  "researching",
  "needs-input",
  "ready",
  "failed",
  "non-actionable",
];

export const REPORT_SECTION_META: Record<
  ReportSectionKey,
  { title: string; blurb: string }
> = {
  researching: {
    title: "Researching now",
    blurb: "The agent is actively investigating these signals.",
  },
  "needs-input": {
    title: "Needs your input to move forward",
    blurb: "Blocked. The agent has questions only you can answer.",
  },
  ready: {
    title: "Ready for your call",
    blurb: "Research is complete. Decide whether to act on these.",
  },
  failed: {
    title: "Failed \u2014 needs more from you",
    blurb: "Something went wrong during research.",
  },
  "non-actionable": {
    title: "Looked into & found non-actionable",
    blurb: "Researched but unlikely to require a fix.",
  },
};

/** A report counts as a PR when it has an implementation PR URL. */
export function isPrReport(report: SignalReport): boolean {
  return !!report.implementation_pr_url;
}

/**
 * Classify a PR report as "ready" (agent-confident, immediately actionable)
 * or "review" (needs human eyes before merging).
 */
export function classifyPrReadiness(report: SignalReport): PrReadiness {
  if (
    report.status === "ready" &&
    report.actionability === "immediately_actionable" &&
    report.already_addressed !== true
  ) {
    return "ready";
  }
  return "review";
}

/** Map a non-PR report to its section key. */
export function getReportSection(report: SignalReport): ReportSectionKey {
  switch (report.status) {
    case "in_progress":
    case "candidate":
    case "potential":
      return "researching";
    case "pending_input":
      return "needs-input";
    case "ready":
      return "ready";
    case "failed":
      return "failed";
    default:
      return "non-actionable";
  }
}

export interface PartitionedInboxItems {
  prReports: { ready: SignalReport[]; review: SignalReport[] };
  reportsBySection: Record<ReportSectionKey, SignalReport[]>;
  prCount: number;
  reportCount: number;
}

/** Split all reports into PR items and report items, pre-grouped by section. */
export function partitionInboxItems(
  reports: SignalReport[],
): PartitionedInboxItems {
  const prReady: SignalReport[] = [];
  const prReview: SignalReport[] = [];
  const reportsBySection: Record<ReportSectionKey, SignalReport[]> = {
    researching: [],
    "needs-input": [],
    ready: [],
    failed: [],
    "non-actionable": [],
  };

  for (const report of reports) {
    if (isPrReport(report)) {
      if (classifyPrReadiness(report) === "ready") {
        prReady.push(report);
      } else {
        prReview.push(report);
      }
    } else {
      const section = getReportSection(report);
      reportsBySection[section].push(report);
    }
  }

  return {
    prReports: { ready: prReady, review: prReview },
    reportsBySection,
    prCount: prReady.length + prReview.length,
    reportCount: Object.values(reportsBySection).reduce(
      (sum, arr) => sum + arr.length,
      0,
    ),
  };
}

/** Filter reports by scope: "for-you" keeps only reports where user is suggested reviewer. */
export function filterByScope(
  reports: SignalReport[],
  scope: "for-you" | "all",
): SignalReport[] {
  if (scope === "all") return reports;
  return reports.filter((r) => r.is_suggested_reviewer === true);
}
