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

function buildCommentBody(
  item: EnrichedListItem,
  enrichedFlags: Map<string, EnrichedFlag>,
  enrichedEvents: Map<string, EnrichedEvent>,
): string | null {
  if (item.type === "flag") {
    const flag = enrichedFlags.get(item.name);
    if (flag) return formatFlagComment(flag);
    return null;
  }
  if (item.type === "event") {
    const event = enrichedEvents.get(item.name);
    if (event) return formatEventComment(event);
    if (item.detail) return `Event: ${item.detail}`;
    return null;
  }
  if (item.type === "init") {
    return `Init: token "${item.name}"`;
  }
  return null;
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
    const body = buildCommentBody(item, enrichedFlags, enrichedEvents);
    if (!body) continue;

    const comment = `${prefix} [PostHog] ${body}`;
    const indent = lines[targetLine]?.match(/^(\s*)/)?.[1] ?? "";
    lines.splice(targetLine, 0, `${indent}${comment}`);
    offset++;
  }

  return lines.join("\n");
}

export function formatInlineComments(
  source: string,
  languageId: string,
  items: EnrichedListItem[],
  enrichedFlags: Map<string, EnrichedFlag>,
  enrichedEvents: Map<string, EnrichedEvent>,
): string {
  const prefix = commentPrefix(languageId);
  const lines = source.split("\n");
  const byLine = new Map<number, string[]>();

  for (const item of items) {
    const body = buildCommentBody(item, enrichedFlags, enrichedEvents);
    if (!body) continue;
    const arr = byLine.get(item.line) ?? [];
    arr.push(body);
    byLine.set(item.line, arr);
  }

  for (const [lineIdx, bodies] of byLine) {
    if (lineIdx < 0 || lineIdx >= lines.length) continue;
    const suffix = ` ${prefix} [PostHog] ${bodies.join(" | ")}`;
    lines[lineIdx] = `${lines[lineIdx]}${suffix}`;
  }

  return lines.join("\n");
}
