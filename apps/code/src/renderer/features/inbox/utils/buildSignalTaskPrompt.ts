import type { SignalReport } from "@shared/types";

/** Same mandate string as PostHog autostart; in Code we surface it first for readability. */
const AUTOSTART_TASK_MANDATE =
  "Act on this signal report. Investigate the root cause, implement the fix, " +
  "and open a PR if appropriate.";

export interface SignalPromptInput {
  report: SignalReport;
  /** `organization/repository` — same argument as autostart’s `repository`. */
  repository: string;
  /** `priority_judgment` artefact explanation; autostart uses `result.priority.explanation`. */
  priorityExplanation?: string | null;
}

/**
 * Build the initial task description for a signal-report cloud task.
 * Body (summary, priority, repository) matches `_build_autostart_task_description`;
 * the mandate line is prepended so it reads first in the UI.
 */
export function buildSignalTaskPrompt({
  report,
  repository,
  priorityExplanation,
}: SignalPromptInput): string {
  const summary = report.summary ?? "";
  const priorityLine =
    report.priority != null
      ? `Priority: ${report.priority}\nReason: ${priorityExplanation ?? ""}\n\n`
      : "";
  return (
    `${AUTOSTART_TASK_MANDATE}\n\n` +
    `${summary}\n\n` +
    `${priorityLine}` +
    `Repository: ${repository}\n`
  );
}
