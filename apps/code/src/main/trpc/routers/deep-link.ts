import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  InboxLinkEvent,
  type InboxLinkService,
  type PendingInboxDeepLink,
} from "../../services/inbox-link/service";
import {
  type PendingDeepLink,
  type PendingNewTaskDeepLink,
  TaskLinkEvent,
  type TaskLinkService,
} from "../../services/task-link/service";
import { publicProcedure, router } from "../trpc";

const getTaskLinkService = () =>
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);

const getInboxLinkService = () =>
  container.get<InboxLinkService>(MAIN_TOKENS.InboxLinkService);

export const deepLinkRouter = router({
  /**
   * Subscribe to task link deep link events.
   * Emits task ID (and optional task run ID) when posthog-code://task/{taskId} or
   * posthog-code://task/{taskId}/run/{taskRunId} is opened.
   */
  onOpenTask: publicProcedure.subscription(async function* (opts) {
    const service = getTaskLinkService();
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
    const service = getTaskLinkService();
    return service.consumePendingDeepLink();
  }),

  /**
   * Subscribe to new-task deep link events.
   * Emits an optional prompt when posthog-code://new?prompt=... is opened.
   */
  onCreateTask: publicProcedure.subscription(async function* (opts) {
    const service = getTaskLinkService();
    const iterable = service.toIterable(TaskLinkEvent.CreateTask, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any pending new-task deep link that arrived before renderer was ready.
   */
  getPendingNewTaskLink: publicProcedure.query(
    (): PendingNewTaskDeepLink | null => {
      const service = getTaskLinkService();
      return service.consumePendingNewTaskDeepLink();
    },
  ),

  /**
   * Subscribe to inbox report deep link events.
   * Emits report ID when posthog-code://inbox/{reportId} is opened.
   */
  onOpenReport: publicProcedure.subscription(async function* (opts) {
    const service = getInboxLinkService();
    const iterable = service.toIterable(InboxLinkEvent.OpenReport, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any pending inbox deep link that arrived before renderer was ready.
   */
  getPendingReportLink: publicProcedure.query(
    (): PendingInboxDeepLink | null => {
      const service = getInboxLinkService();
      return service.consumePendingDeepLink();
    },
  ),
});
