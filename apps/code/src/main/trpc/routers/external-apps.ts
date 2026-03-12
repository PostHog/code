import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  copyPathInput,
  getDetectedAppsOutput,
  getLastUsedOutput,
  openInAppInput,
  openInAppOutput,
  setLastUsedInput,
} from "../../services/external-apps/schemas";
import type { ExternalAppsService } from "../../services/external-apps/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);

export const externalAppsRouter = router({
  getDetectedApps: publicProcedure
    .output(getDetectedAppsOutput)
    .query(() => getService().getDetectedApps()),

  openInApp: publicProcedure
    .input(openInAppInput)
    .output(openInAppOutput)
    .mutation(({ input }) =>
      getService().openInApp(input.appId, input.targetPath),
    ),

  setLastUsed: publicProcedure
    .input(setLastUsedInput)
    .mutation(({ input }) => getService().setLastUsed(input.appId)),

  getLastUsed: publicProcedure
    .output(getLastUsedOutput)
    .query(() => getService().getLastUsed()),

  copyPath: publicProcedure
    .input(copyPathInput)
    .mutation(({ input }) => getService().copyPath(input.targetPath)),
});
