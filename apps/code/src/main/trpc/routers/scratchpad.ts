import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  createScratchpadInput,
  createScratchpadOutput,
  manifestSchema,
  publishInputSchema,
  publishOutputSchema,
  scratchpadListOutput,
  taskIdInput,
  writeManifestInput,
} from "../../services/scratchpad/schemas";
import {
  type ScratchpadService,
  ScratchpadServiceEvent,
  type ScratchpadServiceEvents,
} from "../../services/scratchpad/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<ScratchpadService>(MAIN_TOKENS.ScratchpadService);

function subscribe<K extends keyof ScratchpadServiceEvents & string>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const scratchpadRouter = router({
  create: publicProcedure
    .input(createScratchpadInput)
    .output(createScratchpadOutput)
    .mutation(({ input }) =>
      getService().scaffoldEmpty(input.taskId, input.name, input.projectId),
    ),

  delete: publicProcedure.input(taskIdInput).mutation(async ({ input }) => {
    await getService().delete(input.taskId);
    return { success: true } as const;
  }),

  list: publicProcedure
    .output(scratchpadListOutput)
    .query(() => getService().list()),

  readManifest: publicProcedure
    .input(taskIdInput)
    .output(manifestSchema)
    .query(({ input }) => getService().readManifest(input.taskId)),

  writeManifest: publicProcedure
    .input(writeManifestInput)
    .output(manifestSchema)
    .mutation(({ input }) =>
      getService().writeManifest(input.taskId, input.patch),
    ),

  publish: publicProcedure
    .input(publishInputSchema)
    .output(publishOutputSchema)
    .mutation(({ input }) =>
      getService().publish(input.taskId, {
        repoName: input.repoName,
        visibility: input.visibility,
      }),
    ),

  onCreated: subscribe(ScratchpadServiceEvent.Created),
  onManifestUpdated: subscribe(ScratchpadServiceEvent.ManifestUpdated),
  onPublished: subscribe(ScratchpadServiceEvent.Published),
  onDeleted: subscribe(ScratchpadServiceEvent.Deleted),
});
