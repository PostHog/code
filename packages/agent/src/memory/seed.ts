import { AgentMemoryService } from "./service";
import { MemoryType, RelationType } from "./types";

interface SeedOptions {
  dataDir: string;
}

export function seedMemories(options: SeedOptions): AgentMemoryService {
  const svc = new AgentMemoryService({
    dataDir: options.dataDir,
  });

  const identity = svc.save({
    content:
      "I am an AI coding assistant working on the PostHog Code desktop app",
    memoryType: MemoryType.Identity,
  });

  const identityStack = svc.save({
    content:
      "My primary tech stack is TypeScript, React, Electron and the Claude Agent SDK",
    memoryType: MemoryType.Identity,
  });

  const identityUser = svc.save({
    content:
      "The user is a senior engineer who prefers concise responses and dislikes over-engineering",
    memoryType: MemoryType.Identity,
  });

  const goalMemory = svc.save({
    content:
      "Implement a knowledge graph memory system with hybrid search across the agent package",
    memoryType: MemoryType.Goal,
    importance: 0.95,
  });

  const goalPhase2 = svc.save({
    content:
      "Build MCP tools for save and recall so the agent can interact with memory",
    memoryType: MemoryType.Goal,
    importance: 0.85,
  });

  const goalPhase3 = svc.save({
    content:
      "Add hybrid search combining FTS5, vector similarity and graph traversal with RRF",
    memoryType: MemoryType.Goal,
    importance: 0.8,
  });

  const prefBiome = svc.save({
    content: "Use Biome for linting and formatting, not ESLint or Prettier",
    memoryType: MemoryType.Preference,
  });

  const prefNoBarrel = svc.save({
    content: "No barrel files (index.ts). Import directly from source modules",
    memoryType: MemoryType.Preference,
  });

  const _prefLogger = svc.save({
    content: "Use a scoped logger instead of console.log for all output",
    memoryType: MemoryType.Preference,
  });

  const prefSimple = svc.save({
    content: "Prefer simple over clever. Write the obvious solution first",
    memoryType: MemoryType.Preference,
  });

  const prefPnpm = svc.save({
    content: "Use pnpm for package management with turbo for the monorepo",
    memoryType: MemoryType.Preference,
  });

  const factMonorepo = svc.save({
    content:
      "The repo is a pnpm monorepo with apps/code (Electron), apps/cli, packages/agent, packages/core and packages/shared",
    memoryType: MemoryType.Fact,
  });

  const factDrizzle = svc.save({
    content:
      "The Electron app uses Drizzle ORM with better-sqlite3 for workspace data (repositories, workspaces, worktrees, archives, suspensions)",
    memoryType: MemoryType.Fact,
  });

  const factMemoryDb = svc.save({
    content:
      "The memory system uses raw better-sqlite3 with FTS5 for full-text search, stored in knowledge.db",
    memoryType: MemoryType.Fact,
  });

  const factFts = svc.save({
    content:
      "FTS5 provides full-text search via virtual tables with content-sync triggers for automatic index updates",
    memoryType: MemoryType.Fact,
  });

  const factDI = svc.save({
    content:
      "Main process uses InversifyJS for dependency injection with tokens defined in src/main/di/",
    memoryType: MemoryType.Fact,
  });

  const factTRPC = svc.save({
    content:
      "IPC between main and renderer uses tRPC over Electron IPC via @posthog/electron-trpc",
    memoryType: MemoryType.Fact,
  });

  const factClaudeSDK = svc.save({
    content:
      "The agent package wraps @anthropic-ai/claude-agent-sdk and communicates via ACP protocol",
    memoryType: MemoryType.Fact,
  });

  const decisionRawSqlite = svc.save({
    content:
      "Chose raw better-sqlite3 over Drizzle for the memory module because graph operations are simpler without ORM overhead",
    memoryType: MemoryType.Decision,
  });

  const decisionFts = svc.save({
    content:
      "Chose FTS5 full-text search over vector embeddings to keep the memory system simple and dependency-free",
    memoryType: MemoryType.Decision,
  });

  const decisionRepoService = svc.save({
    content:
      "Split memory storage into Repository (pure data access) and Service (business logic: dedup, decay, prune, merge)",
    memoryType: MemoryType.Decision,
  });

  const eventPhase1 = svc.save({
    content:
      "Completed Phase 1 of memory implementation: types, repository, service and tests all passing",
    memoryType: MemoryType.Event,
  });

  const eventFTS5Fix = svc.save({
    content:
      "FTS5 content-sync triggers now work correctly with merge pattern using delete-then-update",
    memoryType: MemoryType.Event,
    importance: 0.6,
  });

  const eventMergeBug = svc.save({
    content:
      "Merge hit UNIQUE constraint violations when rewiring associations via UPDATE. Fixed with collect-delete-upsert pattern",
    memoryType: MemoryType.Event,
    importance: 0.6,
  });

  const obsElectronNode = svc.save({
    content:
      "better-sqlite3 native module version can mismatch between Electron's Node and system Node. Rebuild with node-gyp when switching",
    memoryType: MemoryType.Observation,
  });

  const obsDecayTesting = svc.save({
    content:
      "Testing time-dependent logic (decay, prune) requires vi.setSystemTime() since created_at is set at insert time",
    memoryType: MemoryType.Observation,
  });

  const obsFtsTriggers = svc.save({
    content:
      "FTS5 content-sync triggers automatically keep the search index in sync with the memories table on insert, update and delete",
    memoryType: MemoryType.Observation,
  });

  const todoMCPTools = svc.save({
    content:
      "Implement save_memory and recall_memory MCP tool definitions for Phase 2",
    memoryType: MemoryType.Todo,
  });

  const todoHybridSearch = svc.save({
    content:
      "Build hybrid search combining text search, vector similarity and graph traversal with RRF merging",
    memoryType: MemoryType.Todo,
  });

  const todoBulletin = svc.save({
    content:
      "Build memory bulletin system that injects relevant context into agent system prompt",
    memoryType: MemoryType.Todo,
  });

  const todoMaintenance = svc.save({
    content:
      "Schedule periodic decay and prune passes for memory maintenance in Phase 5",
    memoryType: MemoryType.Todo,
  });

  // --- Associations ---

  svc.link(identity.id, {
    targetId: identityStack.id,
    relationType: RelationType.RelatedTo,
    weight: 0.9,
  });

  svc.link(identity.id, {
    targetId: identityUser.id,
    relationType: RelationType.RelatedTo,
    weight: 0.8,
  });

  svc.link(goalMemory.id, {
    targetId: goalPhase2.id,
    relationType: RelationType.PartOf,
    weight: 0.9,
  });

  svc.link(goalMemory.id, {
    targetId: goalPhase3.id,
    relationType: RelationType.PartOf,
    weight: 0.9,
  });

  svc.link(goalPhase2.id, {
    targetId: todoMCPTools.id,
    relationType: RelationType.PartOf,
    weight: 0.8,
  });

  svc.link(goalPhase3.id, {
    targetId: todoHybridSearch.id,
    relationType: RelationType.PartOf,
    weight: 0.8,
  });

  svc.link(goalMemory.id, {
    targetId: todoBulletin.id,
    relationType: RelationType.PartOf,
    weight: 0.7,
  });

  svc.link(goalMemory.id, {
    targetId: todoMaintenance.id,
    relationType: RelationType.PartOf,
    weight: 0.7,
  });

  svc.link(factMonorepo.id, {
    targetId: factDrizzle.id,
    relationType: RelationType.RelatedTo,
    weight: 0.6,
  });

  svc.link(factMonorepo.id, {
    targetId: factDI.id,
    relationType: RelationType.RelatedTo,
    weight: 0.5,
  });

  svc.link(factMonorepo.id, {
    targetId: factTRPC.id,
    relationType: RelationType.RelatedTo,
    weight: 0.5,
  });

  svc.link(factDrizzle.id, {
    targetId: factMemoryDb.id,
    relationType: RelationType.RelatedTo,
    weight: 0.7,
  });

  svc.link(factMemoryDb.id, {
    targetId: factFts.id,
    relationType: RelationType.RelatedTo,
    weight: 0.8,
  });

  svc.link(factMemoryDb.id, {
    targetId: decisionRawSqlite.id,
    relationType: RelationType.ResultOf,
    weight: 0.9,
  });

  svc.link(factClaudeSDK.id, {
    targetId: identity.id,
    relationType: RelationType.RelatedTo,
    weight: 0.7,
  });

  svc.link(decisionRawSqlite.id, {
    targetId: factDrizzle.id,
    relationType: RelationType.RelatedTo,
    weight: 0.6,
  });

  svc.link(decisionFts.id, {
    targetId: factFts.id,
    relationType: RelationType.ResultOf,
    weight: 0.9,
  });

  svc.link(decisionFts.id, {
    targetId: factMemoryDb.id,
    relationType: RelationType.RelatedTo,
    weight: 0.8,
  });

  svc.link(decisionRepoService.id, {
    targetId: decisionRawSqlite.id,
    relationType: RelationType.RelatedTo,
    weight: 0.7,
  });

  svc.link(eventPhase1.id, {
    targetId: goalMemory.id,
    relationType: RelationType.ResultOf,
    weight: 0.9,
  });

  svc.link(eventPhase1.id, {
    targetId: decisionRepoService.id,
    relationType: RelationType.ResultOf,
    weight: 0.7,
  });

  svc.link(eventFTS5Fix.id, {
    targetId: eventMergeBug.id,
    relationType: RelationType.RelatedTo,
    weight: 0.6,
  });

  svc.link(obsElectronNode.id, {
    targetId: factMemoryDb.id,
    relationType: RelationType.RelatedTo,
    weight: 0.5,
  });

  svc.link(obsDecayTesting.id, {
    targetId: decisionRepoService.id,
    relationType: RelationType.RelatedTo,
    weight: 0.4,
  });

  svc.link(obsFtsTriggers.id, {
    targetId: factFts.id,
    relationType: RelationType.RelatedTo,
    weight: 0.7,
  });

  svc.link(prefBiome.id, {
    targetId: prefNoBarrel.id,
    relationType: RelationType.RelatedTo,
    weight: 0.4,
  });

  svc.link(prefPnpm.id, {
    targetId: factMonorepo.id,
    relationType: RelationType.RelatedTo,
    weight: 0.7,
  });

  svc.link(prefSimple.id, {
    targetId: decisionRawSqlite.id,
    relationType: RelationType.RelatedTo,
    weight: 0.5,
  });

  svc.link(eventMergeBug.id, {
    targetId: factMemoryDb.id,
    relationType: RelationType.RelatedTo,
    weight: 0.5,
  });

  return svc;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const dataDir = process.argv[2] ?? "./memory-seed-data";
  const svc = seedMemories({ dataDir });
  const count = svc.count();
  svc.close();
  process.stdout.write(
    `Seeded ${count} memories into ${dataDir}/knowledge.db\n`,
  );
}
