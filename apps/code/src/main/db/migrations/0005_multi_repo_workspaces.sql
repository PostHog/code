-- Drop the unique constraint on task_id to allow multiple workspaces per task
DROP INDEX IF EXISTS `workspaces_taskId_unique`;--> statement-breakpoint
-- Add a non-unique index for query performance
CREATE INDEX `workspaces_task_id_idx` ON `workspaces` (`task_id`);--> statement-breakpoint
-- Add label column for display name (e.g., "posthog-js")
ALTER TABLE `workspaces` ADD `label` text;
