import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import { resolveClarificationInputSchema } from "../../services/posthog-code-mcp/schemas";
import {
  PosthogCodeMcpEvent,
  type PosthogCodeMcpService,
} from "../../services/posthog-code-mcp/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<PosthogCodeMcpService>(MAIN_TOKENS.PosthogCodeMcpService);

export const posthogCodeMcpRouter = router({
  resolveClarification: publicProcedure
    .input(resolveClarificationInputSchema)
    .output(z.object({ resolved: z.boolean() }))
    .mutation(({ input }) => {
      const resolved = getService().resolveRequest(input.requestId, {
        answers: input.answers,
        stop: input.stop,
      });
      return { resolved };
    }),

  onClarificationRequested: publicProcedure.subscription(
    async function* (opts) {
      const service = getService();
      const iterable = service.toIterable(
        PosthogCodeMcpEvent.ClarificationRequested,
        { signal: opts.signal },
      );
      for await (const data of iterable) {
        yield data;
      }
    },
  ),
});
