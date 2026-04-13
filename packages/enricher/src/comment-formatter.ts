import type { EnrichedEvent, EnrichedFlag, EnrichedListItem } from "./types.js";

function commentPrefix(languageId: string): string {
  if (languageId === "python" || languageId === "ruby") {
    return "#";
  }
  return "//";
}

function formatFlagComment(flag: EnrichedFlag): string {
  const parts: string[] = [`Flag: "${flag.flagKey}"`];

  if (flag.flag) {
    parts.push(flag.flagType);
    if (flag.rollout !== null) {
      parts.push(`${flag.rollout}% rolled out`);
    }
    if (flag.experiment) {
      const status = flag.experiment.end_date ? "complete" : "running";
      parts.push(`Experiment: "${flag.experiment.name}" (${status})`);
    }
    if (flag.staleness) {
      parts.push(`STALE (${flag.staleness})`);
    }
  }

  return parts.join(" \u2014 ");
}

function formatEventComment(event: EnrichedEvent): string {
  const parts: string[] = [`Event: "${event.eventName}"`];
  if (event.verified) {
    parts.push("(verified)");
  }
  if (event.stats?.volume !== undefined) {
    parts.push(`${event.stats.volume.toLocaleString()} events`);
  }
  if (event.stats?.uniqueUsers !== undefined) {
    parts.push(`${event.stats.uniqueUsers.toLocaleString()} users`);
  }
  if (event.definition?.description) {
    parts.push(event.definition.description);
  }
  return parts.join(" \u2014 ");
}

export function formatComments(
  source: string,
  languageId: string,
  items: EnrichedListItem[],
  enrichedFlags: Map<string, EnrichedFlag>,
  enrichedEvents: Map<string, EnrichedEvent>,
): string {
  const prefix = commentPrefix(languageId);
  const lines = source.split("\n");
  const sorted = [...items].sort((a, b) => a.line - b.line);

  let offset = 0;

  for (const item of sorted) {
    const targetLine = item.line + offset;

    let comment: string | null = null;

    if (item.type === "flag") {
      const flag = enrichedFlags.get(item.name);
      if (flag) {
        comment = `${prefix} [PostHog] ${formatFlagComment(flag)}`;
      }
    } else if (item.type === "event") {
      const event = enrichedEvents.get(item.name);
      if (event) {
        comment = `${prefix} [PostHog] ${formatEventComment(event)}`;
      } else if (item.detail) {
        comment = `${prefix} [PostHog] Event: ${item.detail}`;
      }
    } else if (item.type === "init") {
      comment = `${prefix} [PostHog] Init: token "${item.name}"`;
    }

    if (comment) {
      const indent = lines[targetLine]?.match(/^(\s*)/)?.[1] ?? "";
      lines.splice(targetLine, 0, `${indent}${comment}`);
      offset++;
    }
  }

  return lines.join("\n");
}
