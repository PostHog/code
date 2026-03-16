import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  createEnvironmentInput,
  deleteEnvironmentInput,
  environmentSchema,
  getEnvironmentInput,
  listEnvironmentsInput,
  updateEnvironmentInput,
} from "../../services/environment/schemas";
import type { EnvironmentService } from "../../services/environment/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<EnvironmentService>(MAIN_TOKENS.EnvironmentService);

export const environmentRouter = router({
  list: publicProcedure
    .input(listEnvironmentsInput)
    .output(environmentSchema.array())
    .query(({ input }) => getService().listEnvironments(input.repoPath)),

  get: publicProcedure
    .input(getEnvironmentInput)
    .output(environmentSchema.nullable())
    .query(({ input }) =>
      getService().getEnvironment(input.repoPath, input.id),
    ),

  create: publicProcedure
    .input(createEnvironmentInput)
    .output(environmentSchema)
    .mutation(({ input }) => {
      const { repoPath, ...rest } = input;
      return getService().createEnvironment(rest, repoPath);
    }),

  update: publicProcedure
    .input(updateEnvironmentInput)
    .output(environmentSchema)
    .mutation(({ input }) => {
      const { repoPath, ...rest } = input;
      return getService().updateEnvironment(rest, repoPath);
    }),

  delete: publicProcedure
    .input(deleteEnvironmentInput)
    .mutation(({ input }) =>
      getService().deleteEnvironment(input.repoPath, input.id),
    ),
});
