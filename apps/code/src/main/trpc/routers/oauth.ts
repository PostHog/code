import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import { cancelFlowOutput } from "../../services/oauth/schemas";
import type { OAuthService } from "../../services/oauth/service";
import { publicProcedure, router } from "../trpc";

const getService = () => container.get<OAuthService>(MAIN_TOKENS.OAuthService);

export const oauthRouter = router({
  cancelFlow: publicProcedure
    .output(cancelFlowOutput)
    .mutation(() => getService().cancelFlow()),
});
