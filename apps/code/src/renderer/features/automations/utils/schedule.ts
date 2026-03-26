import type { Automation } from "@shared/types/automations";

function getFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getZonedParts(
  date: Date,
  timezone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = getFormatter(timezone).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function zonedDateTimeToUtc(
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
      0,
      0,
    );
    const intendedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diffMinutes = Math.round((actualMs - intendedMs) / 60_000);

    if (diffMinutes === 0) {
      return guess;
    }

    guess = new Date(guess.getTime() - diffMinutes * 60_000);
  }

  return guess;
}

function parseScheduleTime(scheduleTime: string): {
  hour: number;
  minute: number;
} {
  const [hourText, minuteText] = scheduleTime.split(":");
  return {
    hour: Number(hourText ?? 0),
    minute: Number(minuteText ?? 0),
  };
}

export function computeNextRunAt(
  scheduleTime: string,
  timezone: string,
  fromDate = new Date(),
): string {
  const today = getZonedParts(fromDate, timezone);
  const { hour, minute } = parseScheduleTime(scheduleTime);

  const todayTarget = zonedDateTimeToUtc(
    today.year,
    today.month,
    today.day,
    hour,
    minute,
    timezone,
  );

  if (todayTarget.getTime() > fromDate.getTime()) {
    return todayTarget.toISOString();
  }

  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );

  return zonedDateTimeToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hour,
    minute,
    timezone,
  ).toISOString();
}

export function formatAutomationDateTime(
  isoString: string | null | undefined,
  timezone: string,
): string {
  if (!isoString) {
    return "Not scheduled";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function normalizeAutomationSchedule(
  automation: Automation,
  now = new Date(),
): Automation {
  return {
    ...automation,
    nextRunAt: computeNextRunAt(
      automation.scheduleTime,
      automation.timezone,
      now,
    ),
  };
}
