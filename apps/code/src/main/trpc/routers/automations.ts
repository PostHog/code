import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  type AutomationService,
  AutomationServiceEvent,
} from "../../services/automation/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<AutomationService>(MAIN_TOKENS.AutomationService);

export const automationsRouter = router({
  list: publicProcedure.query(() => {
    return getService().list();
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return getService().getById(input.id);
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        prompt: z.string().min(1).max(10000),
        repoPath: z.string(),
        repository: z.string().nullable().optional(),
        githubIntegrationId: z.number().nullable().optional(),
        scheduleTime: z.string(),
        timezone: z.string(),
        templateId: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => {
      return getService().create(input);
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        prompt: z.string().min(1).max(10000).optional(),
        repoPath: z.string().optional(),
        repository: z.string().nullable().optional(),
        githubIntegrationId: z.number().nullable().optional(),
        scheduleTime: z.string().optional(),
        timezone: z.string().optional(),
        templateId: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return getService().update(id, data);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      getService().delete(input.id);
      return { success: true };
    }),

  triggerNow: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return getService().triggerNow(input.id);
    }),

  triggerAll: publicProcedure.mutation(() => {
    return getService().triggerAll();
  }),

  getRuns: publicProcedure
    .input(
      z.object({
        automationId: z.string(),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .query(({ input }) => {
      return getService().getRuns(input.automationId, input.limit);
    }),

  getRecentRuns: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }))
    .query(({ input }) => {
      return getService().getRecentRuns(input.limit);
    }),

  setCredentials: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        apiHost: z.string(),
        projectId: z.number(),
      }),
    )
    .mutation(({ input }) => {
      getService().setCredentials(input);
      return { success: true };
    }),

  // --- Subscriptions ---

  onAutomationCreated: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(
      AutomationServiceEvent.AutomationCreated,
      { signal: opts.signal },
    )) {
      yield data;
    }
  }),

  onAutomationUpdated: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(
      AutomationServiceEvent.AutomationUpdated,
      { signal: opts.signal },
    )) {
      yield data;
    }
  }),

  onAutomationDeleted: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(
      AutomationServiceEvent.AutomationDeleted,
      { signal: opts.signal },
    )) {
      yield data;
    }
  }),

  onRunStarted: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(
      AutomationServiceEvent.RunStarted,
      { signal: opts.signal },
    )) {
      yield data;
    }
  }),

  onRunCompleted: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(
      AutomationServiceEvent.RunCompleted,
      { signal: opts.signal },
    )) {
      yield data;
    }
  }),
});
