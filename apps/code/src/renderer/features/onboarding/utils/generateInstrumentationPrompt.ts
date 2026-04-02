import type { SignalSourceValues } from "@features/inbox/components/SignalSourceToggles";

export function generateInstrumentationPrompt(
  signals: SignalSourceValues,
): string {
  const parts: string[] = [
    "Set up PostHog instrumentation for this repository.",
  ];

  if (signals.session_replay) {
    parts.push(
      "Install the PostHog SDK if not already present and configure session recording. Initialize with `enable_recording_console_log: true` and ensure session replay is enabled.",
    );
  }

  if (!signals.session_replay) {
    parts.push(
      "Check if the PostHog SDK is installed. If not, install it and initialize it with the project's API key. Set up basic event tracking.",
    );
  }

  return parts.join("\n\n");
}
