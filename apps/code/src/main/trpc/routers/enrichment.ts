import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import type { EnrichmentService } from "../../services/enrichment/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<EnrichmentService>(MAIN_TOKENS.EnrichmentService);

const enrichFileInput = z.object({
  taskId: z.string(),
  filePath: z.string(),
  absolutePath: z.string().optional(),
  content: z.string(),
});

export const enrichmentRouter = router({
  enrichFile: publicProcedure
    .input(enrichFileInput)
    .query(({ input }) => getService().enrichFile(input)),
});
