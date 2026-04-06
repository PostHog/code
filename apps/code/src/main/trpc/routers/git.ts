import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  checkoutBranchInput,
  checkoutBranchOutput,
  cloneRepositoryInput,
  cloneRepositoryOutput,
  commitInput,
  commitOutput,
  createBranchInput,
  createPrInput,
  createPrOutput,
  detectRepoInput,
  detectRepoOutput,
  diffInput,
  diffOutput,
  discardFileChangesInput,
  discardFileChangesOutput,
  generateCommitMessageInput,
  generateCommitMessageOutput,
  generatePrTitleAndBodyInput,
  generatePrTitleAndBodyOutput,
  getAllBranchesInput,
  getAllBranchesOutput,
  getBranchChangedFilesInput,
  getBranchChangedFilesOutput,
  getChangedFilesHeadInput,
  getChangedFilesHeadOutput,
  getCommitConventionsInput,
  getCommitConventionsOutput,
  getCurrentBranchInput,
  getCurrentBranchOutput,
  getDiffStatsInput,
  getDiffStatsOutput,
  getFileAtHeadInput,
  getFileAtHeadOutput,
  getGitRepoInfoInput,
  getGitRepoInfoOutput,
  getGitSyncStatusOutput,
  getLatestCommitInput,
  getLatestCommitOutput,
  getPrChangedFilesInput,
  getPrChangedFilesOutput,
  getPrTemplateInput,
  getPrTemplateOutput,
  ghStatusOutput,
  gitStateSnapshotSchema,
  openPrInput,
  openPrOutput,
  prStatusInput,
  prStatusOutput,
  publishInput,
  publishOutput,
  pullInput,
  pullOutput,
  pushInput,
  pushOutput,
  searchGithubIssuesInput,
  searchGithubIssuesOutput,
  stageFilesInput,
  syncInput,
  syncOutput,
  validateRepoInput,
  validateRepoOutput,
} from "../../services/git/schemas";
import { type GitService, GitServiceEvent } from "../../services/git/service";
import { publicProcedure, router } from "../trpc";

const getService = () => container.get<GitService>(MAIN_TOKENS.GitService);

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(detectRepoInput)
    .output(detectRepoOutput)
    .query(({ input }) => getService().detectRepo(input.directoryPath)),

  validateRepo: publicProcedure
    .input(validateRepoInput)
    .output(validateRepoOutput)
    .query(({ input }) => getService().validateRepo(input.directoryPath)),

  cloneRepository: publicProcedure
    .input(cloneRepositoryInput)
    .output(cloneRepositoryOutput)
    .mutation(({ input }) =>
      getService().cloneRepository(
        input.repoUrl,
        input.targetPath,
        input.cloneId,
      ),
    ),

  onCloneProgress: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(GitServiceEvent.CloneProgress, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  // Branch operations
  getCurrentBranch: publicProcedure
    .input(getCurrentBranchInput)
    .output(getCurrentBranchOutput)
    .query(({ input }) => getService().getCurrentBranch(input.directoryPath)),

  getAllBranches: publicProcedure
    .input(getAllBranchesInput)
    .output(getAllBranchesOutput)
    .query(({ input }) => getService().getAllBranches(input.directoryPath)),

  createBranch: publicProcedure
    .input(createBranchInput)
    .mutation(({ input }) =>
      getService().createBranch(input.directoryPath, input.branchName),
    ),

  checkoutBranch: publicProcedure
    .input(checkoutBranchInput)
    .output(checkoutBranchOutput)
    .mutation(({ input }) =>
      getService().checkoutBranch(input.directoryPath, input.branchName),
    ),

  // File change operations
  getChangedFilesHead: publicProcedure
    .input(getChangedFilesHeadInput)
    .output(getChangedFilesHeadOutput)
    .query(({ input }) =>
      getService().getChangedFilesHead(input.directoryPath),
    ),

  getFileAtHead: publicProcedure
    .input(getFileAtHeadInput)
    .output(getFileAtHeadOutput)
    .query(({ input }) =>
      getService().getFileAtHead(input.directoryPath, input.filePath),
    ),

  getDiffHead: publicProcedure
    .input(diffInput)
    .output(diffOutput)
    .query(({ input }) =>
      getService().getDiffHead(input.directoryPath, input.ignoreWhitespace),
    ),

  getDiffCached: publicProcedure
    .input(diffInput)
    .output(diffOutput)
    .query(({ input }) =>
      getService().getDiffCached(input.directoryPath, input.ignoreWhitespace),
    ),

  getDiffUnstaged: publicProcedure
    .input(diffInput)
    .output(diffOutput)
    .query(({ input }) =>
      getService().getDiffUnstaged(input.directoryPath, input.ignoreWhitespace),
    ),

  getDiffStats: publicProcedure
    .input(getDiffStatsInput)
    .output(getDiffStatsOutput)
    .query(({ input }) => getService().getDiffStats(input.directoryPath)),

  stageFiles: publicProcedure
    .input(stageFilesInput)
    .output(gitStateSnapshotSchema)
    .mutation(({ input }) =>
      getService().stageFiles(input.directoryPath, input.paths),
    ),

  unstageFiles: publicProcedure
    .input(stageFilesInput)
    .output(gitStateSnapshotSchema)
    .mutation(({ input }) =>
      getService().unstageFiles(input.directoryPath, input.paths),
    ),

  discardFileChanges: publicProcedure
    .input(discardFileChangesInput)
    .output(discardFileChangesOutput)
    .mutation(({ input }) =>
      getService().discardFileChanges(
        input.directoryPath,
        input.filePath,
        input.fileStatus,
      ),
    ),

  // Sync status operations
  getGitSyncStatus: publicProcedure
    .input(
      z.object({
        directoryPath: z.string(),
        forceRefresh: z.boolean().optional(),
      }),
    )
    .output(getGitSyncStatusOutput)
    .query(({ input }) =>
      getService().getGitSyncStatus(input.directoryPath, input.forceRefresh),
    ),

  // Commit/repo info operations
  getLatestCommit: publicProcedure
    .input(getLatestCommitInput)
    .output(getLatestCommitOutput)
    .query(({ input }) => getService().getLatestCommit(input.directoryPath)),

  getGitRepoInfo: publicProcedure
    .input(getGitRepoInfoInput)
    .output(getGitRepoInfoOutput)
    .query(({ input }) => getService().getGitRepoInfo(input.directoryPath)),

  commit: publicProcedure
    .input(commitInput)
    .output(commitOutput)
    .mutation(({ input }) =>
      getService().commit(input.directoryPath, input.message, {
        paths: input.paths,
        allowEmpty: input.allowEmpty,
        stagedOnly: input.stagedOnly,
        taskId: input.taskId,
      }),
    ),

  push: publicProcedure
    .input(pushInput)
    .output(pushOutput)
    .mutation(({ input }) =>
      getService().push(
        input.directoryPath,
        input.remote,
        input.branch,
        input.setUpstream,
      ),
    ),

  pull: publicProcedure
    .input(pullInput)
    .output(pullOutput)
    .mutation(({ input }) =>
      getService().pull(input.directoryPath, input.remote, input.branch),
    ),

  publish: publicProcedure
    .input(publishInput)
    .output(publishOutput)
    .mutation(({ input }) =>
      getService().publish(input.directoryPath, input.remote),
    ),

  sync: publicProcedure
    .input(syncInput)
    .output(syncOutput)
    .mutation(({ input }) =>
      getService().sync(input.directoryPath, input.remote),
    ),

  getGhStatus: publicProcedure
    .output(ghStatusOutput)
    .query(() => getService().getGhStatus()),

  getPrStatus: publicProcedure
    .input(prStatusInput)
    .output(prStatusOutput)
    .query(({ input }) => getService().getPrStatus(input.directoryPath)),

  createPr: publicProcedure
    .input(createPrInput)
    .output(createPrOutput)
    .mutation(({ input }) => getService().createPr(input)),

  openPr: publicProcedure
    .input(openPrInput)
    .output(openPrOutput)
    .mutation(({ input }) => getService().openPr(input.directoryPath)),

  getPrTemplate: publicProcedure
    .input(getPrTemplateInput)
    .output(getPrTemplateOutput)
    .query(({ input }) => getService().getPrTemplate(input.directoryPath)),

  getCommitConventions: publicProcedure
    .input(getCommitConventionsInput)
    .output(getCommitConventionsOutput)
    .query(({ input }) =>
      getService().getCommitConventions(input.directoryPath, input.sampleSize),
    ),

  getPrChangedFiles: publicProcedure
    .input(getPrChangedFilesInput)
    .output(getPrChangedFilesOutput)
    .query(({ input }) => getService().getPrChangedFiles(input.prUrl)),

  getBranchChangedFiles: publicProcedure
    .input(getBranchChangedFilesInput)
    .output(getBranchChangedFilesOutput)
    .query(({ input }) =>
      getService().getBranchChangedFiles(input.repo, input.branch),
    ),

  generateCommitMessage: publicProcedure
    .input(generateCommitMessageInput)
    .output(generateCommitMessageOutput)
    .mutation(({ input }) =>
      getService().generateCommitMessage(
        input.directoryPath,
        input.conversationContext,
      ),
    ),

  generatePrTitleAndBody: publicProcedure
    .input(generatePrTitleAndBodyInput)
    .output(generatePrTitleAndBodyOutput)
    .mutation(({ input }) =>
      getService().generatePrTitleAndBody(
        input.directoryPath,
        input.conversationContext,
      ),
    ),

  searchGithubIssues: publicProcedure
    .input(searchGithubIssuesInput)
    .output(searchGithubIssuesOutput)
    .query(({ input }) =>
      getService().searchGithubIssues(
        input.directoryPath,
        input.query,
        input.limit,
      ),
    ),

  onCreatePrProgress: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(GitServiceEvent.CreatePrProgress, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),
});
