import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import type { MemoryService } from "../../services/memory/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<MemoryService>(MAIN_TOKENS.MemoryService);

const memorySchema = z.object({
  id: z.string(),
  content: z.string(),
  memoryType: z.string(),
  importance: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAccessedAt: z.string(),
  accessCount: z.number(),
  source: z.string().nullable(),
  forgotten: z.boolean(),
});

const associationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  relationType: z.string(),
  weight: z.number(),
  createdAt: z.string(),
});

export const memoryRouter = router({
  count: publicProcedure.output(z.number()).query(() => getService().count()),

  list: publicProcedure
    .input(
      z
        .object({
          memoryType: z.string().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .output(z.array(memorySchema))
    .query(({ input }) => getService().list(input ?? undefined)),

  associations: publicProcedure
    .input(z.object({ memoryId: z.string() }))
    .output(z.array(associationSchema))
    .query(({ input }) => getService().getAssociations(input.memoryId)),

  seed: publicProcedure.output(z.number()).mutation(() => getService().seed()),

  reset: publicProcedure.mutation(() => {
    getService().reset();
  }),
});
