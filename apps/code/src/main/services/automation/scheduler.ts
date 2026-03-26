/**
 * Schedule utilities for automations.
 *
 * The model is simple: each automation has a `scheduleTime` (HH:MM)
 * and a `timezone`. It runs daily at that time.
 */

function getZonedParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = getZonedParts(guess, timezone);
    const actualMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const intendedMs = Date.UTC(year, month - 1, day, hour, minute);
    const diff = Math.round((actualMs - intendedMs) / 60_000);
    if (diff === 0) return guess;
    guess = new Date(guess.getTime() - diff * 60_000);
  }
  return guess;
}

/**
 * Compute the next run time for a daily automation.
 * If today's run time hasn't passed, returns today's time.
 * Otherwise returns tomorrow's time.
 */
export function computeNextRunAt(
  scheduleTime: string,
  timezone: string,
  from: Date = new Date(),
): Date {
  const [hourStr, minuteStr] = scheduleTime.split(":");
  const hour = Number(hourStr ?? 0);
  const minute = Number(minuteStr ?? 0);

  const today = getZonedParts(from, timezone);
  const todayTarget = zonedToUtc(
    today.year,
    today.month,
    today.day,
    hour,
    minute,
    timezone,
  );

  if (todayTarget.getTime() > from.getTime()) {
    return todayTarget;
  }

  // Tomorrow
  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );
  return zonedToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hour,
    minute,
    timezone,
  );
}

/**
 * Get the delay in ms until the next run.
 * Returns at least 1000ms to prevent tight loops.
 */
export function getDelayMs(
  scheduleTime: string,
  timezone: string,
  from: Date = new Date(),
): number {
  const next = computeNextRunAt(scheduleTime, timezone, from);
  return Math.max(1000, next.getTime() - from.getTime());
}
