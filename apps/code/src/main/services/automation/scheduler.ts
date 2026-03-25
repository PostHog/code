import type { AutomationSchedule } from "@shared/types/automations";

/**
 * Calculate the next run time for a given schedule from a reference point.
 * Returns a Date representing when the automation should next fire.
 */
export function getNextRunTime(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): Date {
  const next = new Date(from);

  switch (schedule) {
    case "every_15_minutes": {
      next.setMinutes(next.getMinutes() + 15);
      next.setSeconds(0, 0);
      return next;
    }
    case "every_hour": {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
      return next;
    }
    case "every_4_hours": {
      next.setHours(next.getHours() + 4);
      next.setMinutes(0, 0, 0);
      return next;
    }
    case "daily_9am": {
      return getNextTimeOfDay(next, 9, 0);
    }
    case "daily_12pm": {
      return getNextTimeOfDay(next, 12, 0);
    }
    case "daily_6pm": {
      return getNextTimeOfDay(next, 18, 0);
    }
    case "weekday_mornings": {
      return getNextWeekdayAt(next, 9, 0);
    }
    case "weekly_monday_9am": {
      return getNextDayOfWeekAt(next, 1, 9, 0);
    }
    default: {
      // Fallback: 1 hour from now
      next.setHours(next.getHours() + 1);
      return next;
    }
  }
}

function getNextTimeOfDay(from: Date, hour: number, minute: number): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  // If past today's time, schedule for tomorrow
  if (
    next.getHours() > hour ||
    (next.getHours() === hour && next.getMinutes() >= minute)
  ) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(hour, minute, 0, 0);
  return next;
}

function getNextWeekdayAt(from: Date, hour: number, minute: number): Date {
  const next = getNextTimeOfDay(from, hour, minute);
  // Skip weekends
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getNextDayOfWeekAt(
  from: Date,
  dayOfWeek: number,
  hour: number,
  minute: number,
): Date {
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  // Find next occurrence of the target day
  const currentDay = next.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && from >= next) daysUntil = 7;
  next.setDate(next.getDate() + daysUntil);
  return next;
}

/**
 * Get the delay in ms until the next run time.
 * Returns at least 1000ms to prevent tight loops.
 */
export function getDelayMs(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): number {
  const nextRun = getNextRunTime(schedule, from);
  return Math.max(1000, nextRun.getTime() - from.getTime());
}
