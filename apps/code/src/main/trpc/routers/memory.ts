import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import type { MemoryService } from "../../services/memory/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<MemoryService>(MAIN_TOKENS.MemoryService);

export const memoryRouter = router({
  count: publicProcedure
    .output(z.number())
    .query(() => getService().count()),

  seed: publicProcedure
    .output(z.number())
    .mutation(() => getService().seed()),

  reset: publicProcedure
    .mutation(() => {
      getService().reset();
    }),
});
