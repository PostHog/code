import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  startGitHubFlowInput,
  startGitHubFlowOutput,
} from "../../services/github-integration/schemas";
import {
  type FlowTimedOut,
  GitHubIntegrationEvent,
  type GitHubIntegrationService,
  type IntegrationCallback,
} from "../../services/github-integration/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<GitHubIntegrationService>(MAIN_TOKENS.GitHubIntegrationService);

export const githubIntegrationRouter = router({
  startFlow: publicProcedure
    .input(startGitHubFlowInput)
    .output(startGitHubFlowOutput)
    .mutation(({ input }) =>
      getService().startFlow(input.region, input.projectId),
    ),

  /**
   * Subscribe to GitHub integration deep link callbacks emitted after the user
   * completes (or errors out of) the GitHub App install flow on PostHog Cloud.
   */
  onCallback: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(GitHubIntegrationEvent.Callback, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Subscribe to flow timeout events (5 minutes with no deep link callback).
   */
  onFlowTimedOut: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(GitHubIntegrationEvent.FlowTimedOut, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any integration callback that arrived before the renderer subscribed.
   */
  consumePendingCallback: publicProcedure.query(
    (): IntegrationCallback | null => getService().consumePendingCallback(),
  ),
});

export type { IntegrationCallback, FlowTimedOut };
