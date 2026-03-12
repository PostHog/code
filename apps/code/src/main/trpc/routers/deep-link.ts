import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  type PendingDeepLink,
  TaskLinkEvent,
  type TaskLinkService,
} from "../../services/task-link/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);

export const deepLinkRouter = router({
  /**
   * Subscribe to task link deep link events.
   * Emits task ID (and optional task run ID) when posthog-code://task/{taskId} or
   * posthog-code://task/{taskId}/run/{taskRunId} is opened.
   */
  onOpenTask: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(TaskLinkEvent.OpenTask, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any pending deep link that arrived before renderer was ready.
   * This handles the case where the app is launched via deep link.
   */
  getPendingDeepLink: publicProcedure.query((): PendingDeepLink | null => {
    const service = getService();
    return service.consumePendingDeepLink();
  }),
});
