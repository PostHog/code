import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  cancelGitHubFlowOutput,
  startGitHubFlowInput,
  startGitHubFlowOutput,
} from "../../services/github-integration/schemas.js";
import type { GitHubIntegrationService } from "../../services/github-integration/service.js";
import { publicProcedure, router } from "../trpc.js";

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
