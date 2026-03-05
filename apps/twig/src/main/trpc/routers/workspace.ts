import type { WorkspaceRepository } from "../../db/repositories/workspace-repository.js";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  createWorkspaceInput,
  createWorkspaceOutput,
  deleteWorkspaceInput,
  getAllTaskTimestampsOutput,
  getAllWorkspacesOutput,
  getLocalTasksInput,
  getLocalTasksOutput,
  getPinnedTaskIdsOutput,
  getTaskTimestampsInput,
  getTaskTimestampsOutput,
  getWorkspaceInfoInput,
  getWorkspaceInfoOutput,
  getWorkspaceTerminalsInput,
  getWorkspaceTerminalsOutput,
  getWorktreeTasksInput,
  getWorktreeTasksOutput,
  isWorkspaceRunningInput,
  isWorkspaceRunningOutput,
  markActivityInput,
  markViewedInput,
  runStartScriptsInput,
  runStartScriptsOutput,
  togglePinInput,
  togglePinOutput,
  verifyWorkspaceInput,
  verifyWorkspaceOutput,
} from "../../services/workspace/schemas.js";
import {
  type WorkspaceService,
  WorkspaceServiceEvent,
  type WorkspaceServiceEvents,
} from "../../services/workspace/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<WorkspaceService>(MAIN_TOKENS.WorkspaceService);

const getWorkspaceRepo = () =>
  container.get<WorkspaceRepository>(MAIN_TOKENS.WorkspaceRepository);

function subscribe<K extends keyof WorkspaceServiceEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const workspaceRouter = router({
  create: publicProcedure
    .input(createWorkspaceInput)
    .output(createWorkspaceOutput)
    .mutation(({ input }) => getService().createWorkspace(input)),

  delete: publicProcedure
    .input(deleteWorkspaceInput)
    .mutation(({ input }) =>
      getService().deleteWorkspace(input.taskId, input.mainRepoPath),
    ),

  verify: publicProcedure
    .input(verifyWorkspaceInput)
    .output(verifyWorkspaceOutput)
    .query(({ input }) => getService().verifyWorkspaceExists(input.taskId)),

  getInfo: publicProcedure
    .input(getWorkspaceInfoInput)
    .output(getWorkspaceInfoOutput)
    .query(({ input }) => getService().getWorkspaceInfo(input.taskId)),

  getAll: publicProcedure
    .output(getAllWorkspacesOutput)
    .query(() => getService().getAllWorkspaces()),

  runStart: publicProcedure
    .input(runStartScriptsInput)
    .output(runStartScriptsOutput)
    .mutation(({ input }) =>
      getService().runStartScripts(
        input.taskId,
        input.worktreePath,
        input.worktreeName,
      ),
    ),

  isRunning: publicProcedure
    .input(isWorkspaceRunningInput)
    .output(isWorkspaceRunningOutput)
    .query(({ input }) => getService().isWorkspaceRunning(input.taskId)),

  getTerminals: publicProcedure
    .input(getWorkspaceTerminalsInput)
    .output(getWorkspaceTerminalsOutput)
    .query(({ input }) => getService().getWorkspaceTerminals(input.taskId)),

  getLocalTasks: publicProcedure
    .input(getLocalTasksInput)
    .output(getLocalTasksOutput)
    .query(({ input }) =>
      getService().getLocalTasksForFolder(input.mainRepoPath),
    ),

  getWorktreeTasks: publicProcedure
    .input(getWorktreeTasksInput)
    .output(getWorktreeTasksOutput)
    .query(({ input }) => getService().getWorktreeTasks(input.worktreePath)),

  togglePin: publicProcedure
    .input(togglePinInput)
    .output(togglePinOutput)
    .mutation(({ input }) => {
      const repo = getWorkspaceRepo();
      const workspace = repo.findByTaskId(input.taskId);
      if (!workspace) {
        return { isPinned: false, pinnedAt: null };
      }
      const newPinnedAt = workspace.pinnedAt ? null : new Date().toISOString();
      repo.updatePinnedAt(input.taskId, newPinnedAt);
      return { isPinned: newPinnedAt !== null, pinnedAt: newPinnedAt };
    }),

  markViewed: publicProcedure.input(markViewedInput).mutation(({ input }) => {
    const repo = getWorkspaceRepo();
    repo.updateLastViewedAt(input.taskId, new Date().toISOString());
  }),

  markActivity: publicProcedure
    .input(markActivityInput)
    .mutation(({ input }) => {
      const repo = getWorkspaceRepo();
      const workspace = repo.findByTaskId(input.taskId);
      const lastViewedAt = workspace?.lastViewedAt
        ? new Date(workspace.lastViewedAt).getTime()
        : 0;
      const now = Date.now();
      const activityTime = Math.max(now, lastViewedAt + 1);
      repo.updateLastActivityAt(
        input.taskId,
        new Date(activityTime).toISOString(),
      );
    }),

  getPinnedTaskIds: publicProcedure.output(getPinnedTaskIdsOutput).query(() => {
    const repo = getWorkspaceRepo();
    return repo.findAllPinned().map((w) => w.taskId);
  }),

  getTaskTimestamps: publicProcedure
    .input(getTaskTimestampsInput)
    .output(getTaskTimestampsOutput)
    .query(({ input }) => {
      const repo = getWorkspaceRepo();
      const workspace = repo.findByTaskId(input.taskId);
      return {
        pinnedAt: workspace?.pinnedAt ?? null,
        lastViewedAt: workspace?.lastViewedAt ?? null,
        lastActivityAt: workspace?.lastActivityAt ?? null,
      };
    }),

  getAllTaskTimestamps: publicProcedure
    .output(getAllTaskTimestampsOutput)
    .query(() => {
      const repo = getWorkspaceRepo();
      const workspaces = repo.findAll();
      const result: Record<
        string,
        {
          pinnedAt: string | null;
          lastViewedAt: string | null;
          lastActivityAt: string | null;
        }
      > = {};
      for (const w of workspaces) {
        result[w.taskId] = {
          pinnedAt: w.pinnedAt,
          lastViewedAt: w.lastViewedAt,
          lastActivityAt: w.lastActivityAt,
        };
      }
      return result;
    }),

  onTerminalCreated: subscribe(WorkspaceServiceEvent.TerminalCreated),
  onError: subscribe(WorkspaceServiceEvent.Error),
  onWarning: subscribe(WorkspaceServiceEvent.Warning),
  onPromoted: subscribe(WorkspaceServiceEvent.Promoted),
  onBranchChanged: subscribe(WorkspaceServiceEvent.BranchChanged),
});
