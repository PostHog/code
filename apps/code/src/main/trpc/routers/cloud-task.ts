import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  CloudTaskEvent,
  onUpdateInput,
  sendCommandInput,
  sendCommandOutput,
  setViewingInput,
  unwatchInput,
  updateTokenInput,
  watchInput,
} from "../../services/cloud-task/schemas";
import type { CloudTaskService } from "../../services/cloud-task/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<CloudTaskService>(MAIN_TOKENS.CloudTaskService);

export const cloudTaskRouter = router({
  watch: publicProcedure
    .input(watchInput)
    .mutation(({ input }) => getService().watch(input)),

  unwatch: publicProcedure
    .input(unwatchInput)
    .mutation(({ input }) => getService().unwatch(input.taskId, input.runId)),

  updateToken: publicProcedure
    .input(updateTokenInput)
    .mutation(({ input }) => getService().updateToken(input.token)),

  setViewing: publicProcedure
    .input(setViewingInput)
    .mutation(({ input }) =>
      getService().setViewing(input.taskId, input.runId, input.viewing),
    ),

  sendCommand: publicProcedure
    .input(sendCommandInput)
    .output(sendCommandOutput)
    .mutation(({ input }) => getService().sendCommand(input)),

  onUpdate: publicProcedure
    .input(onUpdateInput)
    .subscription(async function* (opts) {
      const service = getService();
      for await (const data of service.toIterable(CloudTaskEvent.Update, {
        signal: opts.signal,
      })) {
        if (
          data.taskId === opts.input.taskId &&
          data.runId === opts.input.runId
        ) {
          yield data;
        }
      }
    }),
});
