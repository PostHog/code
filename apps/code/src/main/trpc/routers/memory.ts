import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  MemoryServiceEvent,
  type MemoryService,
} from "../../services/memory/service";
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

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .output(
      z.array(
        z.object({
          memory: memorySchema,
          score: z.number(),
          rank: z.number(),
        }),
      ),
    )
    .query(({ input }) => getService().search(input.query, input.limit)),

  graph: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(500).optional(),
          memoryType: z.string().optional(),
        })
        .optional(),
    )
    .output(
      z.object({
        nodes: z.array(memorySchema),
        edges: z.array(associationSchema),
      }),
    )
    .query(({ input }) => getService().getGraph(input ?? undefined)),

  associations: publicProcedure
    .input(z.object({ memoryId: z.string() }))
    .output(z.array(associationSchema))
    .query(({ input }) => getService().getAssociations(input.memoryId)),

  maintenance: publicProcedure
    .output(
      z.object({
        decayed: z.number(),
        pruned: z.number(),
        consolidated: z.number(),
      }),
    )
    .mutation(() => getService().runMaintenance()),

  seed: publicProcedure.output(z.number()).mutation(() => getService().seed()),

  reset: publicProcedure.mutation(() => {
    getService().reset();
  }),
});
