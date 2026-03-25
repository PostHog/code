import { z } from "zod";

export const automationRunStatusSchema = z.enum([
  "success",
  "failed",
  "skipped",
  "running",
]);

export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
});

export type AutomationTemplate = z.infer<typeof automationTemplateSchema>;

export const automationSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  repoPath: z.string(),
  repository: z.string().nullable().optional(),
  githubIntegrationId: z.number().nullable().optional(),
  scheduleTime: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  templateId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRunAt: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
  lastRunStatus: automationRunStatusSchema.nullable().optional(),
  lastTaskId: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
});

export type Automation = z.infer<typeof automationSchema>;
