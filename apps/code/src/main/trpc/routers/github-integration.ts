import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  cancelGitHubFlowOutput,
  startGitHubFlowInput,
  startGitHubFlowOutput,
} from "../../services/github-integration/schemas";
import type { GitHubIntegrationService } from "../../services/github-integration/service";
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

  cancelFlow: publicProcedure
    .output(cancelGitHubFlowOutput)
    .mutation(() => getService().cancelFlow()),
});
