import type { Signal, SignalReport, SignalReportArtefact } from "@shared/types";

export interface SignalPromptInput {
  report: SignalReport;
  artefacts: SignalReportArtefact[];
  signals: Signal[];
  replayBaseUrl: string | null;
}

export function buildSignalTaskPrompt({
  report,
  artefacts,
  signals,
  replayBaseUrl,
}: SignalPromptInput): string {
  const title = report.title ?? "Untitled signal";
  const summary = report.summary ?? "No summary available.";

  const lines: string[] = [
    `# Investigate: ${title}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    `**Signal strength:** ${report.signal_count} occurrences`,
  ];

  if (signals.length > 0) {
    lines.push("", "## Signals");

    for (const signal of signals) {
      const timestamp = new Date(signal.timestamp).toLocaleString();
      lines.push(
        "",
        `### ${signal.source_product} / ${signal.source_type} (${timestamp})`,
        "",
        signal.content,
        "",
        `- Weight: ${signal.weight}`,
      );
      if (signal.source_id) {
        lines.push(`- Source ID: ${signal.source_id}`);
      }
    }
  }

  if (artefacts.length > 0) {
    lines.push("", "## Evidence");

    for (const artefact of artefacts) {
      const timestamp = new Date(artefact.content.start_time).toLocaleString();
      lines.push("", `### Session ${timestamp}`, "", artefact.content.content);
      if (replayBaseUrl) {
        lines.push(
          `[View replay](${replayBaseUrl}/${artefact.content.session_id})`,
        );
      }
    }
  }

  return lines.join("\n");
}
