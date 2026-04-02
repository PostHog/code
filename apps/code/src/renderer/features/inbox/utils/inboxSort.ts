import type { SignalReportStatus } from "@shared/types";

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

/** Higher-contrast text color for status badges (step 11 instead of 9). */
export function inboxStatusTextCss(status: SignalReportStatus): string {
  switch (status) {
    case "ready":
      return "var(--green-11)";
    case "pending_input":
      return "var(--violet-11)";
    case "in_progress":
      return "var(--amber-11)";
    case "candidate":
      return "var(--cyan-11)";
    case "potential":
      return "var(--gray-11)";
    case "failed":
      return "var(--red-11)";
    default:
      return "var(--gray-11)";
  }
}

export function inboxStatusBgCss(status: SignalReportStatus): string {
  switch (status) {
    case "ready":
      return "var(--green-3)";
    case "pending_input":
      return "var(--violet-3)";
    case "in_progress":
      return "var(--amber-3)";
    case "candidate":
      return "var(--cyan-3)";
    case "failed":
      return "var(--red-3)";
    default:
      return "var(--gray-3)";
  }
}

export function inboxStatusBorderCss(status: SignalReportStatus): string {
  switch (status) {
    case "ready":
      return "var(--green-6)";
    case "pending_input":
      return "var(--violet-6)";
    case "in_progress":
      return "var(--amber-6)";
    case "candidate":
      return "var(--cyan-6)";
    case "failed":
      return "var(--red-6)";
    default:
      return "var(--gray-6)";
  }
}
