import type { AUTOMATION_SCHEDULES } from "../../main/db/schema";

export type AutomationSchedule = (typeof AUTOMATION_SCHEDULES)[number];

export interface AutomationInfo {
  id: string;
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | "running" | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunInfo {
  id: string;
  automationId: string;
  status: "running" | "success" | "error";
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export const SCHEDULE_LABELS: Record<AutomationSchedule, string> = {
  every_15_minutes: "Every 15 minutes",
  every_hour: "Every hour",
  every_4_hours: "Every 4 hours",
  daily_9am: "Daily at 9:00 AM",
  daily_12pm: "Daily at 12:00 PM",
  daily_6pm: "Daily at 6:00 PM",
  weekday_mornings: "Weekday mornings at 9:00 AM",
  weekly_monday_9am: "Weekly on Monday at 9:00 AM",
};
