import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  HandoffEvent,
  handoffExecuteInput,
  handoffExecuteResult,
  handoffPreflightInput,
  handoffPreflightResult,
} from "../../services/handoff/schemas";
import type { HandoffService } from "../../services/handoff/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<HandoffService>(MAIN_TOKENS.HandoffService);

export const handoffRouter = router({
  preflight: publicProcedure
    .input(handoffPreflightInput)
    .output(handoffPreflightResult)
    .query(({ input }) => getService().preflight(input)),

  execute: publicProcedure
    .input(handoffExecuteInput)
    .output(handoffExecuteResult)
    .mutation(({ input }) => getService().execute(input)),

  onProgress: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .subscription(async function* (opts) {
      const service = getService();
      for await (const data of service.toIterable(HandoffEvent.Progress, {
        signal: opts.signal,
      })) {
        if (data.taskId === opts.input.taskId) {
          yield data;
        }
      }
    }),
});
