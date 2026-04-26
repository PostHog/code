import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import type { Task } from "@shared/types";

type CreateTaskPayload = Parameters<PostHogAPIClient["createTask"]>[0];

interface StepLogger {
  info: (message: string, data?: object) => void;
}

/**
 * Returns the `execute`/`rollback` config for the shared `task_creation`
 * saga step. Both `TaskCreationSaga` and `ScratchpadCreationSaga` use this
 * so the create-then-delete rollback discipline lives in one place.
 */
export function taskCreationStepConfig(
  posthogClient: PostHogAPIClient,
  payload: CreateTaskPayload,
  log: StepLogger,
): {
  execute: () => Promise<Task>;
  rollback: (created: Task) => Promise<void>;
} {
  return {
    execute: async () => {
      const result = await posthogClient.createTask(payload);
      return result as unknown as Task;
    },
    rollback: async (created) => {
      log.info("Rolling back: deleting task", { taskId: created.id });
      await posthogClient.deleteTask(created.id);
    },
  };
}
