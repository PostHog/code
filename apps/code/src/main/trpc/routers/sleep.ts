import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import type { SleepService } from "../../services/sleep/service";
import { publicProcedure, router } from "../trpc";

const getService = () => container.get<SleepService>(MAIN_TOKENS.SleepService);

export const sleepRouter = router({
  getEnabled: publicProcedure
    .output(z.boolean())
    .query(() => getService().getEnabled()),

  setEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      getService().setEnabled(input.enabled);
    }),
});
