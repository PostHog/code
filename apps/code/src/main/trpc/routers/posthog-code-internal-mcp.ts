import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import { PostHogCodeInternalMcpEvent } from "../../services/posthog-code-internal-mcp/schemas";
import type { PostHogCodeInternalMcpService } from "../../services/posthog-code-internal-mcp/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<PostHogCodeInternalMcpService>(
    MAIN_TOKENS.PostHogCodeInternalMcpService,
  );

export const posthogCodeInternalMcpRouter = router({
  onCustomInstructionsChanged: publicProcedure.subscription(
    async function* (opts) {
      const service = getService();
      for await (const data of service.toIterable(
        PostHogCodeInternalMcpEvent.CustomInstructionsChanged,
        { signal: opts.signal },
      )) {
        yield data;
      }
    },
  ),
});
