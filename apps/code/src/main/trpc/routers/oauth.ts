import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  cancelFlowOutput,
  openExternalUrlInput,
  refreshTokenInput,
  refreshTokenOutput,
  startFlowInput,
  startFlowOutput,
  startSignupFlowInput,
} from "../../services/oauth/schemas";
import type { OAuthService } from "../../services/oauth/service";
import { publicProcedure, router } from "../trpc";

const getService = () => container.get<OAuthService>(MAIN_TOKENS.OAuthService);

export const oauthRouter = router({
  startFlow: publicProcedure
    .input(startFlowInput)
    .output(startFlowOutput)
    .mutation(({ input }) => getService().startFlow(input.region)),

  startSignupFlow: publicProcedure
    .input(startSignupFlowInput)
    .output(startFlowOutput)
    .mutation(({ input }) => getService().startSignupFlow(input.region)),

  refreshToken: publicProcedure
    .input(refreshTokenInput)
    .output(refreshTokenOutput)
    .mutation(({ input }) =>
      getService().refreshToken(input.refreshToken, input.region),
    ),

  cancelFlow: publicProcedure
    .output(cancelFlowOutput)
    .mutation(() => getService().cancelFlow()),

  openExternalUrl: publicProcedure
    .input(openExternalUrlInput)
    .mutation(({ input }) => getService().openExternalUrl(input.url)),
});
