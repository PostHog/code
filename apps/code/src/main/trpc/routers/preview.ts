import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  listPreviewsInputSchema,
  listPreviewsOutputSchema,
  unregisterPreviewInputSchema,
} from "../../services/preview/schemas";
import {
  type PreviewService,
  PreviewServiceEvent,
  type PreviewServiceEvents,
} from "../../services/preview/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<PreviewService>(MAIN_TOKENS.PreviewService);

function subscribe<K extends keyof PreviewServiceEvents & string>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const previewRouter = router({
  unregister: publicProcedure
    .input(unregisterPreviewInputSchema)
    .mutation(async ({ input }) => {
      await getService().unregister(input.taskId, input.name);
      return { success: true } as const;
    }),

  list: publicProcedure
    .input(listPreviewsInputSchema)
    .output(listPreviewsOutputSchema)
    .query(({ input }) => getService().list(input.taskId)),

  onRegistered: subscribe(PreviewServiceEvent.PreviewRegistered),
  onReady: subscribe(PreviewServiceEvent.PreviewReady),
  onExited: subscribe(PreviewServiceEvent.PreviewExited),
  onUnregistered: subscribe(PreviewServiceEvent.PreviewUnregistered),
});
