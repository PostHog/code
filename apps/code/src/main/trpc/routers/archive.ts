import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  archivedTaskIdsOutput,
  archiveTaskInput,
  archiveTaskOutput,
  deleteArchivedTaskInput,
  deleteArchivedTaskOutput,
  listArchivedTasksOutput,
  unarchiveTaskInput,
  unarchiveTaskOutput,
} from "../../services/archive/schemas";
import type { ArchiveService } from "../../services/archive/service";
import { publicProcedure, router } from "../trpc";

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

  delete: publicProcedure
    .input(deleteArchivedTaskInput)
    .output(deleteArchivedTaskOutput)
    .mutation(({ input }) => getService().deleteArchivedTask(input.taskId)),
});
