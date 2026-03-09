CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`last_accessed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_path_unique` ON `repositories` (`path`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`repository_id` text,
	`mode` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`worktree_name` text,
	`branch_name` text,
	`checkpoint_id` text,
	`archived_at` text,
	`pinned_at` text,
	`last_viewed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workspaces_active_archive_fields_null" CHECK("workspaces"."state" = 'archived' OR (
        "workspaces"."worktree_name" IS NULL AND
        "workspaces"."branch_name" IS NULL AND
        "workspaces"."checkpoint_id" IS NULL AND
        "workspaces"."archived_at" IS NULL
      )),
	CONSTRAINT "workspaces_archived_at_required" CHECK(("workspaces"."state" = 'active' AND "workspaces"."archived_at" IS NULL) OR
          ("workspaces"."state" = 'archived' AND "workspaces"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_active_task_id_unique` ON `workspaces` (`task_id`) WHERE "workspaces"."state" = 'active';--> statement-breakpoint
CREATE TABLE `worktrees` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worktrees_workspace_id_unique` ON `worktrees` (`workspace_id`);