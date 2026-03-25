import type { Embedder } from "./embedding";
import { AgentMemoryService } from "./service";
import { MemoryType, RelationType } from "./types";

interface SeedOptions {
  dataDir: string;
  embedder?: Embedder;
}

export async function seedMemories(
  options: SeedOptions,
): Promise<AgentMemoryService> {
  const svc = new AgentMemoryService({
    dataDir: options.dataDir,
    embedder: options.embedder,
  });

  const identity = await svc.save({
    content:
      "I am an AI coding assistant working on the PostHog Code desktop app",
    memoryType: MemoryType.Identity,
  });

  const identityStack = await svc.save({
    content:
      "My primary tech stack is TypeScript, React, Electron and the Claude Agent SDK",
    memoryType: MemoryType.Identity,
  });

  const identityUser = await svc.save({
    content:
      "The user is a senior engineer who prefers concise responses and dislikes over-engineering",
    memoryType: MemoryType.Identity,
  });

  const goalMemory = await svc.save({
    content:
      "Implement a knowledge graph memory system with hybrid search across the agent package",
    memoryType: MemoryType.Goal,
    importance: 0.95,
  });

  const goalPhase2 = await svc.save({
    content:
      "Build MCP tools for save and recall so the agent can interact with memory",
    memoryType: MemoryType.Goal,
    importance: 0.85,
  });

  const goalPhase3 = await svc.save({
    content:
      "Add hybrid search combining FTS5, vector similarity and graph traversal with RRF",
    memoryType: MemoryType.Goal,
    importance: 0.8,
  });

  const prefBiome = await svc.save({
    content: "Use Biome for linting and formatting, not ESLint or Prettier",
    memoryType: MemoryType.Preference,
  });

  const prefNoBarrel = await svc.save({
    content: "No barrel files (index.ts). Import directly from source modules",
    memoryType: MemoryType.Preference,
  });

  const _prefLogger = await svc.save({
    content: "Use a scoped logger instead of console.log for all output",
    memoryType: MemoryType.Preference,
  });

  const prefSimple = await svc.save({
    content: "Prefer simple over clever. Write the obvious solution first",
    memoryType: MemoryType.Preference,
  });

  const prefPnpm = await svc.save({
    content: "Use pnpm for package management with turbo for the monorepo",
    memoryType: MemoryType.Preference,
  });

  const factMonorepo = await svc.save({
    content:
      "The repo is a pnpm monorepo with apps/code (Electron), apps/cli, packages/agent, packages/core and packages/shared",
    memoryType: MemoryType.Fact,
  });

  const factDrizzle = await svc.save({
    content:
      "The Electron app uses Drizzle ORM with better-sqlite3 for workspace data (repositories, workspaces, worktrees, archives, suspensions)",
    memoryType: MemoryType.Fact,
  });

  const factMemoryDb = await svc.save({
    content:
      "The memory system uses raw better-sqlite3 with sqlite-vec for vector search, stored in knowledge.db",
    memoryType: MemoryType.Fact,
  });

  const factVec = await svc.save({
    content:
      "sqlite-vec provides vector similarity search via vec0 virtual tables with KNN MATCH queries",
    memoryType: MemoryType.Fact,
  });

  const factDI = await svc.save({
    content:
      "Main process uses InversifyJS for dependency injection with tokens defined in src/main/di/",
    memoryType: MemoryType.Fact,
  });

  const factTRPC = await svc.save({
    content:
      "IPC between main and renderer uses tRPC over Electron IPC via @posthog/electron-trpc",
    memoryType: MemoryType.Fact,
  });

  const factClaudeSDK = await svc.save({
    content:
      "The agent package wraps @anthropic-ai/claude-agent-sdk and communicates via ACP protocol",
    memoryType: MemoryType.Fact,
  });

  const decisionRawSqlite = await svc.save({
    content:
      "Chose raw better-sqlite3 over Drizzle for the memory module because graph operations are simpler without ORM overhead",
    memoryType: MemoryType.Decision,
  });

  const decisionSqliteVec = await svc.save({
    content:
      "Chose sqlite-vec over LanceDB for vector search to keep everything in a single SQLite database",
    memoryType: MemoryType.Decision,
  });

  const decisionRepoService = await svc.save({
    content:
      "Split memory storage into Repository (pure data access) and Service (business logic: dedup, decay, prune, merge)",
    memoryType: MemoryType.Decision,
  });

  const eventPhase1 = await svc.save({
    content:
      "Completed Phase 1 of memory implementation: types, repository, service and tests all passing",
    memoryType: MemoryType.Event,
  });

  const eventFTS5Bug = await svc.save({
    content:
      "FTS5 triggers caused SQL logic errors during update/delete/merge. Removed FTS5 entirely for Phase 1",
    memoryType: MemoryType.Event,
    importance: 0.6,
  });

  const eventMergeBug = await svc.save({
    content:
      "Merge hit UNIQUE constraint violations when rewiring associations via UPDATE. Fixed with collect-delete-upsert pattern",
    memoryType: MemoryType.Event,
    importance: 0.6,
  });

  const obsElectronNode = await svc.save({
    content:
      "better-sqlite3 native module version can mismatch between Electron's Node and system Node. Rebuild with node-gyp when switching",
    memoryType: MemoryType.Observation,
  });

  const obsDecayTesting = await svc.save({
    content:
      "Testing time-dependent logic (decay, prune) requires vi.setSystemTime() since created_at is set at insert time",
    memoryType: MemoryType.Observation,
  });

  const obsVecRowid = await svc.save({
    content:
      "sqlite-vec requires integer rowids and rejects bound integer params. Use a vec_map table and interpolate rowids as SQL literals",
    memoryType: MemoryType.Observation,
  });

  const todoMCPTools = await svc.save({
    content:
      "Implement save_memory and recall_memory MCP tool definitions for Phase 2",
    memoryType: MemoryType.Todo,
  });

  const todoHybridSearch = await svc.save({
    content:
      "Build hybrid search combining text search, vector similarity and graph traversal with RRF merging",
    memoryType: MemoryType.Todo,
  });

  const todoBulletin = await svc.save({
    content:
      "Build memory bulletin system that injects relevant context into agent system prompt",
    memoryType: MemoryType.Todo,
  });

  const todoMaintenance = await svc.save({
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
    targetId: factVec.id,
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

  svc.link(decisionSqliteVec.id, {
    targetId: factVec.id,
    relationType: RelationType.ResultOf,
    weight: 0.9,
  });

  svc.link(decisionSqliteVec.id, {
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

  svc.link(eventFTS5Bug.id, {
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

  svc.link(obsVecRowid.id, {
    targetId: factVec.id,
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
  const svc = await seedMemories({ dataDir });
  const count = svc.count();
  svc.close();
  process.stdout.write(
    `Seeded ${count} memories into ${dataDir}/knowledge.db\n`,
  );
}
