import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  archivedTaskIdsOutput,
  archiveTaskInput,
  archiveTaskOutput,
  listArchivedTasksOutput,
  unarchiveTaskInput,
  unarchiveTaskOutput,
} from "../../services/archive/schemas.js";
import type { ArchiveService } from "../../services/archive/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ArchiveService>(MAIN_TOKENS.ArchiveService);

export const archiveRouter = router({
  archive: publicProcedure
    .input(archiveTaskInput)
    .output(archiveTaskOutput)
    .mutation(({ input }) => getService().archiveTask(input)),

  unarchive: publicProcedure
    .input(unarchiveTaskInput)
    .output(unarchiveTaskOutput)
    .mutation(({ input }) =>
      getService().unarchiveTask(input.taskId, input.recreateBranch),
    ),

  list: publicProcedure
    .output(listArchivedTasksOutput)
    .query(() => getService().getArchivedTasks()),

  archivedTaskIds: publicProcedure
    .output(archivedTaskIdsOutput)
    .query(() => getService().getArchivedTaskIds()),
});
