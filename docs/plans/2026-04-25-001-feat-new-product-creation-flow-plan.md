---
title: 'feat: Add "New product" creation flow with Socratic scaffolding'
type: feat
status: completed
date: 2026-04-25
deepened: 2026-04-26
origin: in-conversation brainstorm (no requirements doc)
---

# feat: Add "New product" creation flow with Socratic scaffolding

## Overview

Add a "New product" flow to PostHog Code that scaffolds a brand-new, locally-running, PostHog-instrumented product in a tmp directory, using a Socratic pre-task dialog to clarify intent before the agent writes a line of code. Scratchpads list alongside real tasks with a draft icon, run inside a built-in web preview pane, and graduate to a real GitHub repo via a "Publish" button.

This is a **Lovable-style on-ramp** for devs who already understand coding agents — minimum friction from idea to running code, with PostHog analytics, replay, error tracking, and (where relevant) LLM analytics wired up from the first commit.

## Problem Frame

Today, PostHog Code only operates on existing local repos with jj/git. A dev with a new product idea (production app or hackathon) has to manually scaffold elsewhere, then bring the repo back. There is no surface for "I have an idea, give me a working app" — the moment of greatest agent leverage.

Lovable owns that moment for non-devs. PostHog Code can own it for devs by combining: (a) a real local agent loop on real code, (b) a Socratic clarification step that pushes the user to articulate requirements, (c) production-grade scaffolding with PostHog instrumentation by default, (d) a one-click Publish path to GitHub.

## Requirements Trace

- **R1.** Entry point: a "New product" affordance lives directly under the existing "New task" input on the tasks screen, plus a Command Palette entry.
- **R2.** Pre-task dialog runs an LLM-driven Socratic clarification with up to **3 rounds** by default, user-configurable up to a hard cap of **5**. The dialog tells the user upfront how many rounds will run.
- **R3.** Each clarification step has an AI-prefilled answer + free-text override; the agent generates the questions dynamically per the user's idea.
- **R4.** Dialog must always cover: app type, **stack** (agent suggests on demand, no hardcoded matrix; PostHog is implicit), product name, PostHog project (existing project picker, or auto-create as `[UNPUBLISHED] {name}`).
- **R5.** Agent scaffolds a new repo in a tmp/scratchpad directory. **No `git init` at scaffold time** — rollback uses the existing agent checkpoint system.
- **R6.** A `.posthog.json` manifest is written at repo root with at minimum `{ projectId: number }`; schema is extensible.
- **R7.** Scaffolded apps are auto-instrumented with PostHog: product analytics, session replay (web/mobile), error tracking, LLM analytics for AI features. Driven by existing PostHog MCP skills as slash-prompts.
- **R8.** A built-in **web preview pane** runs for web products. The agent declares the preview via a custom tool call (`registerPreview`) — no on-disk preview manifest.
- **R9.** Scratchpads appear in the tasks list alongside real tasks, with a **draft icon** instead of the git/branches icon. Multiple in-flight scratchpads are allowed.
- **R10.** Each unpublished scratchpad row exposes a **Trash** button as the only cleanup mechanism. No auto-expiry.
- **R11.** "Publish" creates a GitHub repo + initial push, renames the PostHog project from `[UNPUBLISHED] {name}` → `{name}`, and flips the draft icon to the standard git icon.
- **R12.** Stack implementation is fully delegated to the agent; PostHog Code does not ship with a hardcoded stack matrix.

## Scope Boundaries

**Out of scope for v1:**

- Hosting / deployment automation (e.g., Vercel push). Future work.
- Hardcoded stack matrix or stack templates. The agent picks per idea.
- Auto-cleanup policy for stale drafts. Manual Trash only.
- Non-dev onboarding surface (no marketing-page entry, no logged-out flow).
- Server-side PostHog backend changes beyond the existing `POST /api/projects/` and `PATCH /api/projects/{id}/` endpoints.
- Promoting scratchpads out of the scratchpad on-disk location after publish (they stay where they were scaffolded).

## Context & Research

### Relevant Code and Patterns

- **Task creation saga** — `apps/code/src/renderer/sagas/task/task-creation.ts`. Exact pattern to mirror: `task_creation` → `folder_registration` → `workspace_creation` → optional `cloud_run` → `agent_session`, each with rollbacks, using `Saga` from `@posthog/shared`.
- **"New task" input** — `apps/code/src/renderer/features/task-detail/components/TaskInput.tsx`. Houses `PromptInput`, `FolderPicker`, `WorkspaceModeSelect`. The "New product" entry button goes adjacent to the prompt input here.
- **Command palette** — `apps/code/src/renderer/features/command/components/CommandMenu.tsx` (lines 192–198 has "Create new task"). Add "Create new product" alongside; analytics extends `CommandMenuAction` in `@shared/types/analytics`.
- **Task list rows / icons** — `apps/code/src/renderer/features/sidebar/components/items/TaskItem.tsx` (icon resolution lines 178–204) and `TaskListView.tsx` line 348 (group section icon). Draft icon swap happens here.
- **Hover toolbar** — `apps/code/src/renderer/features/sidebar/components/items/TaskItem.tsx` `TaskHoverToolbar` (lines 48–105). Trash button slots in here for unpublished scratchpads.
- **tRPC + service mirror** — `apps/code/src/main/trpc/routers/git.ts` paired with `apps/code/src/main/services/git/service.ts`. DI tokens at `apps/code/src/main/di/tokens.ts`, service registration at `apps/code/src/main/di/container.ts`, router wiring at `apps/code/src/main/trpc/router.ts`.
- **TypedEventEmitter** — `apps/code/src/main/utils/typed-event-emitter.ts`. Services emit, tRPC subscriptions yield via `service.toIterable(EventName, { signal })`.
- **Worktree path derivation** — `apps/code/src/main/utils/worktree-helpers.ts::deriveWorktreePath` and `getWorktreeLocation()` in `apps/code/src/main/services/settingsStore.ts`. Add a sibling `getScratchpadLocation()` returning `<userData>/scratchpads/<taskId>/<sanitized-name>/`.
- **PostHog API client** — `apps/code/src/renderer/api/posthogClient.ts` has `getProject(projectId)` (line 568). Need new `createProject` and `updateProject` wrappers (the PostHog API exposes `POST /api/projects/` and `PATCH /api/projects/{id}/`).
- **MCP skills via slash-prompts** — `apps/code/src/renderer/features/skill-buttons/prompts.ts` `SKILL_BUTTONS` table. Skill IDs to invoke during scaffolding: `instrument-integration`, `instrument-product-analytics`, `instrument-error-tracking`, `instrument-llm-analytics` (conditional). Sent via `buildSkillButtonPromptBlocks` as `ContentBlock[]` with zod-validated `_meta.posthogCode.skillButtonId`.
- **Bundled MCP server** — `apps/code/src/main/services/mcp-proxy/service.ts` and `apps/code/src/main/services/posthog-plugin/service.ts`. Add `posthog_code__askClarification` and `posthog_code__registerPreview` tools here.
- **MCP config plumbing** — `packages/agent/src/adapters/claude/session/mcp-config.ts::parseMcpServers` and `packages/agent/src/adapters/claude/session/options.ts`.
- **ACP permission flow** — `packages/agent/src/adapters/claude/session/options.ts:40,322` (`canUseTool`), handlers at `packages/agent/src/adapters/claude/permissions/permission-handlers.ts`. Custom tools surface through this — no parallel `permission_request` channel.
- **Session-update rendering** — `apps/code/src/renderer/features/sessions/components/session-update/`. Add a custom `<ClarificationBlock>` for `askClarification` tool calls.
- **Panel system for preview tab** — `apps/code/src/renderer/features/panels/store/panelLayoutStore.ts` (`addActionTab` etc.) and `apps/code/src/renderer/features/task-detail/components/TabContentRenderer.tsx`. Add a `Tab.data.type = "preview"` discriminator.
- **Closest existing process-bound panel** — `ActionPanel` (terminal output bound to a child process). Mirror its lifecycle (id + command + cwd) for the preview server process.
- **Existing GitHub auth surface** — `apps/code/src/main/trpc/routers/git.ts::getGhStatus` + `getGhAuthToken`. Reachable from the new publish flow.
- **GitService publish** — `apps/code/src/main/services/git/service.ts::publish` is push-only today. The new publish flow needs `git init` + `git add` + initial commit + `gh repo create` (`POST /user/repos`) + `git remote add` + push.
- **Architecture doc** — `apps/code/ARCHITECTURE.md` is the supplement to root `CLAUDE.md` and is required reading.

### Institutional Learnings

- No `docs/solutions/` exists yet. No prior plan in `docs/plans/`. This plan is greenfield.

### External References

External research skipped — local patterns are strong, novel pieces (preview pane, GitHub repo create) use well-known APIs. Defer external lookups to implementation time if needed.

## Key Technical Decisions

- **Scratchpads are real PostHog tasks** — but the **manifest is the authoritative source of draft state.** Tasks flow through `posthogClient.createTask` like any other so agent sessions, sidebar rendering, and existing infra "just work." Draft-vs-published is decided by `.posthog.json::published`, NOT the project-name prefix and NOT a server-side `metadata.scratchpad` flag. Rationale: the manifest lives on disk under our control and is what `publish` actually flips. The `[UNPUBLISHED] ` project-name prefix is purely a cosmetic hint in the PostHog UI (and is user-editable, so unsafe as a derivation source). A `metadata.scratchpad` flag, if added, is a pure list-query optimisation. All consumers (`isDraftTask`, draft icon, Trash button, Publish button) read from the same manifest-derived boolean.
- **Scratchpad-ness is orthogonal to workspace mode.** Do **not** extend `WorkspaceMode` with a `"scratchpad"` value — that conflates "where execution happens" with "is this a draft." Add a separate axis (e.g. `kind: "task" | "scratchpad"` or `scratchpad: boolean`) on `Workspace`, leaving `mode` to mean local/worktree/cloud. Rationale: every existing call site that switches on `WorkspaceMode` (branch derivation, `WorkspaceModeSelect`, `createWorkspace`) would otherwise grow a new fall-through case meaning "treat like local but skip git stuff" — that is exactly the cross-cutting bug we want to avoid.
- **No `git init` until Publish.** Per the brainstorm, rollback during ideation rides on the existing agent checkpoint system; one giant first commit at Publish is acceptable for v1. Trade-off: no per-iteration history for unpublished work; revisited when deployment lands. **Verify before Unit 5** that the checkpoint system covers a no-git workspace; if not, this becomes a hard requirement to surface in the dialog.
- **Custom MCP tools, not bespoke IPC channels.** `posthog_code__askClarification` (Socratic) and `posthog_code__registerPreview` (preview) are added to the bundled MCP server. Both surface through the existing ACP `canUseTool` pipeline. Rationale: CLAUDE.md mandates user input/approval via tool calls; this keeps the agent fully agent-native.
- **Preview server is owned by main, not by the agent shell.** The agent calls `registerPreview({ command, port, cwd })` and a new `PreviewService` spawns + supervises the process (lifecycle, restart, kill on task close, port conflict). Rationale: matches the existing `ActionPanel` pattern; centralises supervision.
- **Preview webview uses one shared partition, like a browser.** All preview webviews run in `partition: "preview"` (single session shared across scratchpads), with `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`. Rationale: a developer iterating across multiple scratchpads benefits from staying logged into a local auth provider, the same way Chrome doesn't isolate tabs from each other. The partition is still separate from PostHog Code's main session, so the preview cannot observe PostHog Code's own renderer state. Trade-off explicitly accepted: cookies/localStorage from one preview are visible to another preview running on a different `127.0.0.1` port.
- **Preview port denylist + cwd guard.** `registerPreview` rejects well-known ports and rejects `cwd` paths that resolve outside the scratchpad root. Concrete denylist defined in Unit 7. Rationale: prevents the agent from accidentally shadowing real local services or supervising long-running processes outside the scratchpad.
- **Auto-instrumentation runs as agent slash-prompts**, not deterministic codegen. After scaffolding, the agent receives a sequence of `/instrument-integration`, `/instrument-product-analytics`, `/instrument-error-tracking`, and (conditional) `/instrument-llm-analytics`. Rationale: reuses the existing skill mechanism; agent picks the SDK that matches its chosen stack. **Ordering between scaffolding and skill prompts is observe-and-recover, not enforced** — if `/instrument-product-analytics` runs before the SDK package is installed, the agent retries inside its own loop. Don't add planning-time enforcement for this.
- **Saga ownership and step ordering.** Scratchpad creation uses a `ScratchpadCreationSaga` mirroring `TaskCreationSaga` shape. **`task_creation` runs FIRST** to mint the `taskId` that the on-disk path embeds. Order: `posthog_project` (if auto-create) → `task_creation` → `scratchpad_dir` → `manifest_finalize` → `workspace_creation` → `agent_session`. Each step has a tested rollback.
- **`posthog_project` rollback strategy: delete the auto-created project.** On creation-flow rollback and on Trash, the auto-created `[UNPUBLISHED] {name}` PostHog project is deleted via a new `deleteProject` API wrapper (Unit 2). Rationale: avoids cluttering the user's PostHog UI with abandoned projects. Only auto-created projects are deleted — projects the user picked from the existing-project picker are never touched.
- **On-disk location.** Scratchpads live in `<userData>/scratchpads/<taskId>/<sanitized-name>/` (NOT `os.tmpdir()`, which the OS may sweep). Persisted alongside other PostHog Code state.
- **Manifest schema** — `.posthog.json`:
  ```
  {
    projectId: number,
    published: boolean,                                     // AUTHORITATIVE for draft state
    preview?: Array<{ name: string, command: string, port: number, cwd?: string }>,
    publishedAt?: string,                                   // ISO8601, set on Publish
    githubRemote?: string                                   // set on Publish
  }
  ```
  Writes are atomic (temp-file-plus-rename). Reads validate with Zod. The agent must not write `.posthog.json` directly — the manifest is owned by `ScratchpadService` (hard constraint in the scaffolding system prompt).
- **Single-instance lock.** PostHog Code uses Electron's `app.requestSingleInstanceLock()` — only one instance can run per machine. Subsumes any per-scratchpad multi-instance contention.
- **Default GitHub repo visibility** — **private** on Publish, with a confirmation field in the Publish dialog so the user can flip it before push.
- **Auto-created PostHog project** — created in the user's **current organization** by default; the project picker in the dialog allows selecting another org.
- **Renderer state shape** — scratchpad-being-created state lives in a new `useScratchpadCreationStore` (mirror of `useProvisioningStore` shape). After creation, scratchpads ride the same TanStack-Query `tasks/list` cache as real tasks; the draft state is derived from manifest, fetched via a tRPC `scratchpad.readManifest` query batched against `tasks/list`.

## Open Questions

### Resolved During Planning

- **Where do scratchpads live on disk?** → `<userData>/scratchpads/<taskId>/<sanitized-name>/`.
- **Are they real PostHog tasks?** → Yes; routed through the same `posthogClient.createTask` path.
- **How does the agent receive Socratic answers?** → Via a custom MCP tool `posthog_code__askClarification` going through ACP's `canUseTool`.
- **How does the agent declare preview?** → Custom MCP tool `posthog_code__registerPreview` — main-process spawns the dev server. Multiple previews per task supported, keyed by `(taskId, name)`.
- **How is auto-instrumentation invoked?** → Sequence of slash-prompts (`/instrument-integration`, `/instrument-product-analytics`, `/instrument-error-tracking`, `/instrument-llm-analytics` if AI) injected as the agent's first non-clarification turns.
- **Repo visibility default for Publish?** → Private, user-overridable in the Publish dialog.
- **Webview vs BrowserView for preview?** → Electron `<webview>`. `BrowserView` is a future revisit if devtools embedding becomes a hard requirement.
- **Preview lifecycle on app relaunch?** → Auto-resume. Port conflicts surface as a per-preview retry affordance.
- **Task title source?** → Product name from the dialog verbatim. No auto-title generation.

### Deferred to Implementation

- **Exact ACP block type for the clarification UI.** Likely a permission-style block with structured-fields content; concrete schema decided during Unit 6 implementation.
- **Final shape of the scaffolding agent's system prompt addition.** Drafted in Unit 5, refined during integration testing.

## Implementation Units

- [ ] **Unit 1: Scratchpad domain, on-disk layout, and service skeleton**

**Goal:** Establish the main-process foundations: scratchpad on-disk location, manifest schema + I/O, `ScratchpadService` skeleton with DI registration and tRPC router, sqlite metadata if needed for fast list queries.

**Requirements:** R5, R6, R9, R10

**Dependencies:** None

**Files:**
- Create: `apps/code/src/main/services/scratchpad/schemas.ts`
- Create: `apps/code/src/main/services/scratchpad/service.ts`
- Create: `apps/code/src/main/services/scratchpad/service.test.ts`
- Create: `apps/code/src/main/trpc/routers/scratchpad.ts`
- Modify: `apps/code/src/main/services/settingsStore.ts` (add `getScratchpadLocation()`)
- Modify: `apps/code/src/main/di/tokens.ts` (`MAIN_TOKENS.ScratchpadService`)
- Modify: `apps/code/src/main/di/container.ts` (register `ScratchpadService`)
- Modify: `apps/code/src/main/trpc/router.ts` (mount `scratchpadRouter`)
- Modify: `apps/code/src/main/utils/worktree-helpers.ts` (add scratchpad-path helper if symmetrical to `deriveWorktreePath`)

**Approach:**
- `ScratchpadService extends TypedEventEmitter<ScratchpadServiceEvents>`, `@injectable()`. Mirrors `GitService` shape.
- Events: `Created`, `ManifestUpdated`, `PreviewRegistered`, `PreviewReady`, `PreviewExited`, `Published`, `Deleted`.
- Methods: `scaffoldEmpty(taskId, name, projectId)`, `readManifest(taskId)`, `writeManifest(taskId, patch)`, `delete(taskId)`. Publish lives in Unit 9.
- Manifest path: `<scratchpadDir>/.posthog.json`. Writes are atomic (temp + rename). Reads validate with Zod; missing or malformed manifests throw — caller handles per its own UX (e.g. sidebar treats as not-draft and logs).
- Sanitized directory name = lowercase, hyphenated, ASCII, max 64 chars.
- App-level single-instance lock via `app.requestSingleInstanceLock()` is the only multi-instance guard. No per-scratchpad lockfile.
- tRPC router exposes: `create.mutation`, `delete.mutation`, `list.query`, `readManifest.query`, plus `onEvent.subscription` over the typed event channel.

**Patterns to follow:**
- `apps/code/src/main/services/git/service.ts` (shape, event emitter, DI)
- `apps/code/src/main/trpc/routers/git.ts` (router style, subscriptions via `service.toIterable`)

**Test scenarios:**
- `scaffoldEmpty` creates the directory and writes a default manifest with `published: false` and the supplied `projectId`.
- `readManifest` throws on missing file and on Zod validation failure.
- `writeManifest` is atomic — a simulated mid-write crash does not leave a partial file.
- Concurrent `writeManifest` calls serialize without corrupting the manifest.
- `delete` removes the directory tree and emits `Deleted`.

**Verification:**
- A new tRPC mutation `trpcClient.scratchpad.create.mutate({ ... })` from the renderer creates a directory at the expected path with a valid manifest, and emits a `Created` event observed by a test subscriber.

---

- [ ] **Unit 2: PostHog API — project create + rename**

**Goal:** Add wrappers for project creation and rename to the renderer-side PostHog client; surface them via TanStack Query mutations.

**Requirements:** R4, R11

**Dependencies:** None

**Files:**
- Modify: `apps/code/src/renderer/api/posthogClient.ts` (add `createProject`, `updateProject`, `deleteProject` wrappers)
- Modify: `apps/code/src/renderer/api/generated.ts` (regenerate or hand-extend if not auto-generated for these endpoints; otherwise add manually-typed methods alongside)
- Create: `apps/code/src/renderer/features/posthog-projects/hooks/useCreateProject.ts`
- Create: `apps/code/src/renderer/features/posthog-projects/hooks/useUpdateProject.ts`
- Create: `apps/code/src/renderer/features/posthog-projects/hooks/useDeleteProject.ts`
- Create: `apps/code/src/renderer/features/posthog-projects/hooks/useCreateProject.test.ts`

**Approach:**
- `createProject(input: { name: string, organizationId?: string })` POSTs `/api/projects/`.
- `updateProject(projectId: number, patch: { name?: string })` PATCHes `/api/projects/{id}/`.
- `deleteProject(projectId: number)` DELETEs `/api/projects/{id}/`. Used by saga rollback and Trash. Hook is `useDeleteProject`.
- Hooks use `useAuthenticatedClient` + `useMutation`; on success, invalidate the `projects/list` cache.
- Default org = current org from `authStore.currentOrganizationId`.

**Patterns to follow:**
- `apps/code/src/renderer/api/posthogClient.ts::getProject` (auth wiring)
- Existing mutation hooks in `apps/code/src/renderer/features/tasks/hooks/` (e.g. `useUpdateTask`)

**Test scenarios:**
- `createProject` posts the expected body and returns parsed project metadata.
- `updateProject` rename happy path.
- `deleteProject` happy path; 403 (insufficient permissions) surfaces a clear error.
- 401 from API surfaces via the auth-error handler used elsewhere.
- Cache invalidation triggers `projects/list` refetch.

**Verification:**
- Calling `useCreateProject` from a test component creates a project visible in the next `useProjects()` snapshot; `useUpdateProject({ name })` updates it without a full refetch.

---

- [ ] **Unit 3: "New product" entry points (TaskInput button + command palette)**

**Goal:** Surface the "New product" affordance under the prompt input on the tasks screen and as a command palette entry. Both open the same Product Creation Dialog.

**Requirements:** R1

**Dependencies:** Unit 4 (dialog component)

**Files:**
- Modify: `apps/code/src/renderer/features/task-detail/components/TaskInput.tsx`
- Modify: `apps/code/src/renderer/features/command/components/CommandMenu.tsx`
- Modify: `apps/code/src/shared/types/analytics.ts` (extend `CommandMenuAction` with `"create_new_product"`)
- Create: `apps/code/src/renderer/features/scratchpads/hooks/useOpenProductCreationDialog.ts`

**Approach:**
- New small button below or beside `PromptInput` in `TaskInput.tsx`, styled consistently with adjacent affordances.
- Command palette entry `Command.Item value="Create new product"` adjacent to the existing `Create new task` entry.
- Both call `useOpenProductCreationDialog()` which sets a `useScratchpadCreationStore` field to open the dialog.
- Analytics tracked via the existing `track(ANALYTICS_EVENTS.COMMAND_MENU_ACTION, ...)` mechanism.

**Patterns to follow:**
- `CommandMenu.tsx` lines 192–198 (existing "Create new task")
- Button placement style of existing TaskInput child elements

**Test scenarios:**
- Both entry points dispatch the same store action.
- Analytics event fires with `action_type: "create_new_product"`.
- Keyboard shortcut for the command palette item works (if added).

**Verification:**
- Clicking the button under `PromptInput` opens the Product Creation Dialog. Pressing the command-palette entry opens the same dialog. Both fire analytics.

---

- [ ] **Unit 4: Product Creation Dialog (initial submit screen)**

**Goal:** A polished, visually smooth dialog that collects the initial idea, product name, clarification rounds (3 default, max 5), and PostHog project choice (existing picker or auto-create). On submit, kicks off the saga.

**Requirements:** R2, R3 (UI), R4

**Dependencies:** Unit 2 (project create), Unit 5 (saga)

**Files:**
- Create: `apps/code/src/renderer/features/scratchpads/components/ProductCreationDialog.tsx`
- Create: `apps/code/src/renderer/features/scratchpads/components/ProductCreationDialog.test.tsx`
- Create: `apps/code/src/renderer/features/scratchpads/components/ProjectPicker.tsx`
- Create: `apps/code/src/renderer/features/scratchpads/stores/scratchpadCreationStore.ts`
- Create: `apps/code/src/renderer/features/scratchpads/stores/scratchpadCreationStore.test.ts`

**Approach:**
- Dialog uses Radix UI Dialog + Tailwind v4 (per CLAUDE.md). Visually smooth state transitions: an explicit step machine (`idle → collecting → submitting`) animated with CSS transitions on dialog body height/opacity.
- Top-of-dialog header tells the user upfront: *"We'll ask up to N rounds of clarifying questions to shape your product."* with an inline rounds selector (3 / 5).
- Required fields: product name (free text), initial idea (multi-line), PostHog project (existing dropdown OR "Auto-create new project" checkbox → uses `[UNPUBLISHED] {name}`).
- Submit calls `runScratchpadCreationSaga(...)` (Unit 5). The dialog stays open with a progress label until the agent session is established, then closes and navigates to the new task.
- Store: `useScratchpadCreationStore` holds `open`, `step`, `lastError`. State only — orchestration lives in the saga (per CLAUDE.md store/service boundary).

**Patterns to follow:**
- `useProvisioningStore` in `apps/code/src/renderer/features/provisioning/stores/provisioningStore.ts` for pure-state shape
- Existing Radix dialogs in the renderer for animation idioms

**Test scenarios:**
- Default rounds is 3; selector caps at 5; values < 1 rejected at the form layer.
- Submit with "Auto-create new project" calls `useCreateProject`.
- Submit with an existing project skips create.
- Submit while saga is mid-flight is a no-op (button disabled).
- Saga error surfaces in `lastError` and re-enables submit.

**Verification:**
- Filling the dialog and submitting runs the saga to completion and lands the user on the new task screen with the agent's first turn rendered.

---

- [ ] **Unit 5: ScratchpadCreationSaga + augmented agent system prompt**

**Goal:** The end-to-end orchestrator: scratchpad dir, manifest, optional PostHog project create, PostHog task create with appropriate metadata, workspace pointed at scratchpad path, agent session connect with a system-prompt augmentation that instructs the agent to (a) run Socratic clarification, (b) scaffold, (c) instrument with PostHog skills, (d) register preview.

**Requirements:** R2, R3, R5, R6, R7, R12

**Dependencies:** Unit 1, Unit 2, and the existing TaskCreationSaga

**Files:**
- Create: `apps/code/src/renderer/sagas/scratchpad/scratchpad-creation.ts`
- Create: `apps/code/src/renderer/sagas/scratchpad/scratchpad-creation.test.ts`
- Create: `apps/code/src/renderer/sagas/scratchpad/scaffolding-prompt.ts` (the augmented agent system prompt builder)
- Modify: `apps/code/src/main/services/workspace/service.ts` (accept a `scratchpad: true` axis on `Workspace` orthogonal to `WorkspaceMode`)
- Modify: `apps/code/src/main/services/workspace/schemas.ts` (add `scratchpad?: boolean` to `Workspace` schema; do NOT extend `WorkspaceMode`)

**Approach:**
- Saga steps with rollbacks (mirror `TaskCreationSaga`). **Step ordering corrected from initial draft:** `task_creation` runs first to mint the `taskId` that the on-disk path embeds.
  1. `posthog_project` — if "auto-create": `useCreateProject(...)` with name `[UNPUBLISHED] {name}`. Rollback: `useDeleteProject(...)`.
  2. `task_creation` — `posthogClient.createTask({ projectId, title: productName, ..., metadata: { scratchpad: true } })`. The product name from the dialog is the task title verbatim — no auto-title generation. Rollback: `deleteTask`.
  3. `scratchpad_dir` — `trpcClient.scratchpad.create.mutate({ taskId, name, projectId })` (Unit 1). Writes the complete manifest atomically. Rollback: `trpcClient.scratchpad.delete.mutate({ taskId })`.
  4. `workspace_creation` — `trpcClient.workspace.create.mutate({ taskId, mainRepoPath: scratchpadPath, mode: <local-equivalent>, scratchpad: true, ... })`. Rollback: workspace delete.
  5. `agent_session` — `getSessionService().connectToTask(...)` with `systemPromptAddon = buildScaffoldingPrompt(brief, rounds)`.
- Scaffolding prompt addon (directional sketch — refined during implementation):
  - "You are scaffolding a brand-new product in `<scratchpadPath>`. The user has given you `<initialIdea>`. Before writing any code, run up to `<rounds>` rounds of Socratic clarification using the `posthog_code__askClarification` tool. Each round may ask multiple questions; each question must include a `prefilledAnswer` representing your best guess. Skipping clarification entirely is allowed when the request is fully specified, but encouraged for at least one round otherwise. After clarification, scaffold the product using your chosen stack (production-grade, simple). Then run these PostHog skills as slash-prompts: `/instrument-integration`, `/instrument-product-analytics`, `/instrument-error-tracking`. If the product has AI features, also run `/instrument-llm-analytics`. Finally, declare each dev server you start with `posthog_code__registerPreview({ name, command, port, cwd })` — call it once per process (e.g. once for frontend, once for backend if both run)."
  - Hard constraints embedded in the prompt: never run `git init`; do not add any deployment scripts; do not pick a non-mainstream stack; **never write `.posthog.json` directly** — the manifest is owned by the host. Instrumentation skill ordering is observe-and-recover (skill failures are recoverable in the agent loop, not enforced at planning time).

**Execution note:** Add an integration test for the saga happy path with mocked services before extending the agent prompt — the prompt is the long pole, easier to iterate behind a green test.

**Patterns to follow:**
- `apps/code/src/renderer/sagas/task/task-creation.ts` (saga shape + `SagaLogger` adapter)
- `Saga` from `@posthog/shared`

**Test scenarios:**
- Happy path: all 5 steps complete; renderer ends up on new task screen with the agent's first turn rendered; task title is the product name verbatim.
- Failure at step 3 (`scratchpad_dir`) deletes the task and deletes the auto-created PostHog project.
- Failure at step 5 (`agent_session`) rolls back all earlier steps.
- "Existing PostHog project" path skips step 1 cleanly and never deletes the user-picked project on failure.
- Saga aborts honourably if user closes the dialog mid-flight (signal propagation; rollbacks fire in reverse order).

**Verification:**
- Mocked saga test demonstrates correct ordering, rollback behaviour, and final state. Manual smoke: a real "build me a chess clock" idea results in an open task with Socratic clarification as the first agent turn.

---

- [ ] **Unit 6: `posthog_code__askClarification` MCP tool + clarification UI block**

**Goal:** A custom MCP tool the agent calls to ask clarification questions; a custom session-update block that renders the questions with AI-prefilled answers + free-text override; enforce the round cap.

**Requirements:** R2, R3

**Dependencies:** Unit 1 (service event channel), Unit 5 (system prompt drives it)

**Files:**
- Modify: `apps/code/src/main/services/posthog-plugin/service.ts` (or `mcp-proxy/service.ts`) — add `posthog_code__askClarification` tool definition
- Create: `apps/code/src/main/services/posthog-plugin/tools/ask-clarification.ts`
- Create: `apps/code/src/main/services/posthog-plugin/tools/ask-clarification.test.ts`
- Modify: `packages/agent/src/adapters/claude/permissions/permission-handlers.ts` (route the tool through `canUseTool`)
- Create: `apps/code/src/renderer/features/sessions/components/session-update/ClarificationBlock.tsx`
- Modify: `apps/code/src/renderer/features/sessions/components/session-update/<index renderer>` to dispatch on the tool name
- Modify: `apps/code/src/shared/types.ts` (zod schema for clarification request/response in the agent meta channel)

**Approach:**
- Tool input schema (Zod): `{ questions: Array<{ id: string, question: string, prefilledAnswer: string, kind: "text" | "select", options?: string[] }>, roundIndex: number, roundsTotal: number }`.
- Tool output schema: `{ answers: Array<{ id: string, answer: string }>, stop?: boolean }`. `stop: true` signals the agent should skip remaining clarification rounds and proceed to scaffolding.
- The renderer renders one form per question with the prefilled value populated. Submit triggers an ACP permission response that resolves the tool call.
- Round cap is a **UX/cost guard, not a security boundary** — the agent retains independent ability to scaffold without ever calling this tool. Enforcement is best-effort (tool returns an error past the cap, agent recovers in its own loop). Tracked on the session in-memory.
- The header of the clarification block shows `Round {N} of {M}` with a "Stop and start scaffolding" button that resolves the tool with `{ answers: prefilled, stop: true }`.

**Patterns to follow:**
- Existing tool blocks in `apps/code/src/renderer/features/sessions/components/session-update/` (`ToolCallBlock`, `McpToolBlock`)
- ACP `canUseTool` flow at `packages/agent/src/adapters/claude/session/options.ts:40,322`
- CLAUDE.md "Permissions via tool calls"

**Test scenarios:**
- Single round: tool resolves with user answers and the agent receives them.
- Skip rounds: "Stop and start scaffolding" returns prefilled answers and stops further calls.
- Cap exceeded: 4th call when `roundsTotal=3` errors with a helpful message the agent can recover from.
- Empty answers: the form accepts the prefilled defaults if the user just hits Enter.
- Session reload mid-clarification: the block re-renders with the current state (no answer loss).

**Verification:**
- An end-to-end manual run: the agent calls `askClarification` 1–3 times for a "build me a habit tracker" idea; the user sees the questions, accepts defaults on round 2, agent transitions to scaffolding.

---

- [ ] **Unit 7: `posthog_code__registerPreview` MCP tool + PreviewService + preview tab**

**Goal:** A custom MCP tool the agent calls to declare its dev server; a `PreviewService` that spawns and supervises the process; a new panel tab type that renders an Electron `<webview>` pointed at the local URL.

**Requirements:** R8

**Dependencies:** Unit 1 (manifest write), Unit 5 (agent prompt)

**Files:**
- Create: `apps/code/src/main/services/preview/service.ts`
- Create: `apps/code/src/main/services/preview/service.test.ts`
- Create: `apps/code/src/main/services/preview/schemas.ts`
- Create: `apps/code/src/main/trpc/routers/preview.ts`
- Modify: `apps/code/src/main/services/posthog-plugin/service.ts` — add `posthog_code__registerPreview` tool definition
- Create: `apps/code/src/main/services/posthog-plugin/tools/register-preview.ts`
- Modify: `apps/code/src/main/di/tokens.ts`, `apps/code/src/main/di/container.ts`, `apps/code/src/main/trpc/router.ts`
- Create: `apps/code/src/renderer/features/preview/components/PreviewPanel.tsx`
- Modify: `apps/code/src/renderer/features/panels/store/panelLayoutStore.ts` (`Tab.data.type = "preview"` discriminator)
- Modify: `apps/code/src/renderer/features/task-detail/components/TabContentRenderer.tsx` (render `PreviewPanel` for preview tabs)

**Approach:**
- `PreviewService extends TypedEventEmitter<PreviewServiceEvents>`, `@injectable()`. Owns process lifecycle keyed by `(taskId, name)` — multiple previews per task supported (e.g. `frontend` + `backend`). Re-registering with the same key kills the prior process first.
- Tool input schema (Zod): `{ name: string, command: string, port: number, cwd?: string, healthPath?: string }`. Tool output: `{ url: string }`.
- Manifest's `preview` array is updated atomically on each successful `register`.
- **Input validation** (executed by `register-preview.ts` before spawning):
  - `cwd` resolved with `path.resolve(scratchpadRoot, cwd ?? ".")` and rejected if it escapes `scratchpadRoot`.
  - `port` rejected if in the denylist (5432 Postgres, 6379 Redis, 8123 ClickHouse, 9000 PostHog dev, 22, 25, 80, 443) or already bound by another in-flight preview.
- `register` spawns via `node-pty`, polls `http://127.0.0.1:{port}{healthPath ?? "/"}` until 2xx/3xx/404 (60s timeout), emits `PreviewReady`.
- `unregister(taskId, name?)` kills the named process (or all for the task if `name` omitted).
- Preview tab opens automatically on `PreviewReady` with the preview `name` as the tab label.
- `PreviewPanel` renders an Electron `<webview src={url}>` with `partition="preview"`, `nodeIntegration={false}`, `contextIsolation={true}`, `webSecurity={true}`. Toolbar: refresh, copy URL, open in external browser.

**Preview lifecycle:**
- **Tab close ≠ process kill.** Closing a tab is view-only; the process runs until task close, scratchpad delete, re-registration, explicit "stop preview" action, or app shutdown.
- **Session disconnect mid-`registerPreview`.** Spawn is aborted before the process starts; agent retries on reconnect.
- **App relaunch — auto-resume.** `PreviewService` re-registers each scratchpad's `manifest.preview` entries on startup. Per-preview failures surface as retry affordances; they do NOT block startup.
- **File watcher coordination.** Vite/Next/etc. own their own file watchers; no `FileWatcherService` hooks needed.

**Execution note:** Implement service + tool first behind a green unit test using a stub child process; integrate with the renderer last.

**Patterns to follow:**
- `apps/code/src/main/services/git/service.ts` (event emitter shape)
- `ActionPanel` (existing process-bound tab, lifecycle reference)
- `node-pty` usage in existing terminal services

**Test scenarios:**
- Happy path: `register` spawns process, port comes up, emits `PreviewReady` with URL.
- Multi-preview: two concurrent registrations under different `name`s both run; two tabs open.
- Re-register same `(taskId, name)` kills the prior process first.
- Rejects denylisted ports.
- Rejects ports already bound by another in-flight preview.
- Rejects `cwd` paths that escape the scratchpad root.
- Process crash mid-run emits `PreviewExited` with exit code; tab marked degraded.
- App shutdown kills all preview processes (no orphans).
- App relaunch auto-spawns from `manifest.preview`; per-preview failures surface inline without blocking startup.
- Tab close keeps process running; reopen attaches to the live URL.

**Verification:**
- Manual: an agent that runs `pnpm create vite my-app && cd my-app && pnpm install && pnpm dev` then calls `registerPreview({ command: "pnpm dev", port: 5173, cwd: "my-app" })` results in a preview tab opening with the running app inside ~30s.

---

- [ ] **Unit 8: Draft icon + Trash flow on task rows**

**Goal:** Visually distinguish unpublished scratchpads in the sidebar with a draft icon, and add a per-row Trash button that runs `scratchpad.delete` (which also kills preview, deletes PostHog `[UNPUBLISHED]` project, deletes task).

**Requirements:** R9, R10

**Dependencies:** Unit 1 (delete), Unit 7 (preview kill)

**Files:**
- Modify: `apps/code/src/renderer/features/sidebar/components/items/TaskItem.tsx` (icon resolution lines 178–204; hover toolbar lines 48–105)
- Modify: `apps/code/src/renderer/features/sidebar/components/TaskListView.tsx` (group section icon line 348)
- Create: `apps/code/src/renderer/features/scratchpads/hooks/useDeleteScratchpad.ts`
- Create: `apps/code/src/renderer/features/scratchpads/hooks/useDeleteScratchpad.test.ts`
- Create: `apps/code/src/renderer/features/scratchpads/utils/isDraftTask.ts` (derive draft state)

**Approach:**
- `isDraftTask(task)` returns true iff the task has an associated scratchpad manifest with `published: false` (manifest is the single source of truth — see Key Technical Decisions). Manifest read failures are treated as not-draft.
- Manifest is read via `trpcClient.scratchpad.readManifest.query`, cached in TanStack Query alongside `tasks/list`. Subscriptions to `scratchpad.onEvent` invalidate the cache.
- Icon swap: where `TaskItem` resolves the leading icon, branch on `isDraftTask` → `<NotePencil>` instead of the default.
- Group section: when all rows in a group are drafts, swap the section's `<GitBranch>` for the draft icon.
- Hover toolbar: append a `<TrashButton>` rendered conditionally on `isDraftTask`. Confirm popover then `useDeleteScratchpad`.
- `useDeleteScratchpad`:
  1. `trpcClient.preview.unregister(taskId)` (kills all named previews; best-effort).
  2. `trpcClient.scratchpad.delete(taskId)` (removes dir + manifest).
  3. If the linked PostHog project name still starts with `[UNPUBLISHED] ` (i.e. auto-created): `useDeleteProject(projectId)`. User-picked existing projects are never deleted.
  4. `posthogClient.deleteTask(taskId)`.
  5. Invalidate `tasks/list` and the manifest query.

**Patterns to follow:**
- Existing pin/archive icon buttons in `TaskHoverToolbar`
- Existing confirm popover style elsewhere in the sidebar

**Test scenarios:**
- Draft task row shows draft icon + Trash button.
- Published task row shows git icon + no Trash button.
- Trash flow halts gracefully if any of the cleanup steps fail (toast surfaces the failure but partial state is reasonable).
- Mixed group (some drafts, some published) keeps the group's git icon.

**Verification:**
- Creating a scratchpad puts a draft-iconed row in the sidebar; clicking Trash deletes the dir and the PostHog project (if auto-created), and the row disappears.

---

- [ ] **Unit 9: Publish flow**

**Goal:** Convert an unpublished scratchpad into a real GitHub repo + initial commit + push, then rename the PostHog project from `[UNPUBLISHED] {name}` → `{name}` and flip the manifest `published: true`.

**Requirements:** R11

**Dependencies:** Unit 1, Unit 2, Unit 8 (icon flips)

**Files:**
- Modify: `apps/code/src/main/services/scratchpad/service.ts` (add `publish(taskId, { repoName, visibility })`)
- Modify: `apps/code/src/main/trpc/routers/scratchpad.ts` (add `publish.mutation`)
- Modify: `apps/code/src/main/services/git/service.ts` (extract `gh repo create` helper if not already factored)
- Create: `apps/code/src/renderer/features/scratchpads/components/PublishDialog.tsx`
- Create: `apps/code/src/renderer/features/scratchpads/components/PublishDialog.test.tsx`
- Create: `apps/code/src/renderer/features/scratchpads/hooks/usePublishScratchpad.ts`
- Modify: `apps/code/src/renderer/features/task-detail/components/TaskDetail.tsx` or sibling header to surface the **Publish** button when the active task is a draft scratchpad

**Approach:**
- Service-side `publish`:
  1. Read manifest. Reject if already `published: true`.
  2. **Project access pre-flight.** Call `getProject(manifest.projectId)`; reject if 403/404 (the user signed out and back in as someone without access, or the project was deleted). On reject, surface a "project no longer accessible — relink to a new project or unlink before publishing" recovery dialog and abort before any GitHub call.
  3. **Secret-leakage guard.** Ensure a `.gitignore` exists (write a sane default if missing — `node_modules/`, `.env*`, `dist/`, `build/`, `.DS_Store`, `*.pem`, `*.key`). Walk the directory; if any tracked-after-gitignore file matches `^\.env`, `*.pem`, `*.key`, or is larger than a configurable threshold (default 5 MB), refuse to publish until the user explicitly confirms or fixes. Report the offending paths in the dialog so the user can act.
  4. `git init`, configure default branch (`main`), `git add . && git commit -m "Initial commit"`.
  5. Call GitHub `POST /user/repos` using token from `getGhAuthToken()`. Body: `{ name: sanitized(repoName), private: visibility === "private", description: ... }`.
  6. `git remote add origin <ssh-or-https>` and `git push -u origin main`.
  7. `updateProject(projectId, { name: productName })` — drops the `[UNPUBLISHED] ` prefix.
  8. Patch manifest: `published: true`, `publishedAt`, `githubRemote`.
  9. Emit `Published`.
- Renderer dialog collects: repo name (default = sanitized product name), visibility (default private), confirms "this will create a public/private repo on github.com/{user}". Disabled when the user has no `gh` token (link to auth). If the secret-leakage guard fires, the dialog blocks submit and lists the offending paths.
- Publish failure handling:
  - Failure before step 5 (no remote created): clean up local changes (`rm -rf .git`).
  - Failure after step 5 but before step 8 (remote created, push or rename failed): leave remote intact, surface a "Retry publish" affordance — never auto-delete a remote GitHub repo.
  - PostHog rename failure (step 7): publish still succeeds; rename failure surfaces as a non-blocking warning ("repo published, project rename failed — try again from project settings").

**Patterns to follow:**
- Existing `GitService.publish` for push mechanics
- Existing `getGhAuthToken` use in `git.ts` router

**Test scenarios:**
- Happy path: scratchpad with three local files publishes; PostHog project name updated; manifest reflects `published: true`.
- Secret-leakage guard: scratchpad containing `.env` blocks publish until the user fixes it.
- Project access pre-flight: scratchpad whose `manifest.projectId` returns 403 surfaces the relink dialog before any GitHub call.
- No `gh` token: Publish dialog disables the submit and links to gh-auth.
- Repo name conflict (422 from GitHub): error surfaces inline; user can rename and retry; no local `.git` left over from a prior attempt.
- Network failure during push (after repo create): leaves remote intact; UI surfaces a "retry publish" affordance.
- PostHog rename failure (step 7): publish still succeeds end-to-end; warning toast surfaces.
- Already published: `publish` is a no-op + warning.

**Verification:**
- A scratchpad iterated to a basic working state publishes to a private GitHub repo; the sidebar row's icon flips to the standard git icon; the PostHog project loses the `[UNPUBLISHED] ` prefix.

## System-Wide Impact

- **Interaction graph:** New flow plugs into TaskInput, CommandMenu, sidebar TaskItem, panel/tab system, agent session ACP layer, bundled MCP server, PostHog API client, GitService publish path. The new `ScratchpadService`, `PreviewService`, and `posthog-projects` hooks are net-new but follow established shapes.
- **Error propagation:** Saga rollbacks must be honest — partial state on cancellation is the most likely tripping point. Each saga step has a tested rollback. The Publish flow has a deliberate non-symmetry (we don't auto-delete remote repos on partial failure).
- **Tab discriminator:** Adding `Tab.data.type = "preview"` requires tab persistence/rehydration to handle the new variant; tab labels include the preview `name` for multi-preview disambiguation.
- **API surface parity:** `createProject` / `updateProject` / `deleteProject` are net-new on the renderer client and may benefit other product surfaces; we keep them general-purpose.
- **Integration coverage:** Unit tests cover happy paths and rollbacks; the agent-shaped pieces (Socratic dialog, scaffolding, instrumentation slash-prompts) are validated via at least one manual smoke run before merge.

## Risks & Dependencies

- **Risk (high): preview port shadowing of well-known local services.** Agent picking 5432 / 6379 / 8123 / 9000 / etc. could hijack or render unrelated local responses. **Mitigation:** port denylist enforced in `register-preview.ts` before spawn (Unit 7).
- **Risk (medium, accepted): preview webviews share a cookie jar.** Single `partition: "preview"` means cookies/storage carry across previews. Trade-off accepted (see Key Technical Decisions).
- **Risk (medium): secrets leaked into the initial publish commit.** Agent-scaffolded code may include `.env`, `*.pem`, or large binaries. **Mitigation:** Publish-time secret-leakage guard (Unit 9).
- **Risk (medium): `manifest.projectId` becomes invalid (user signed out / project deleted).** **Mitigation:** project-access pre-flight in Unit 9 surfaces a relink dialog before any GitHub call.
- **Risk (medium): manifest write contention between host and agent.** **Mitigation:** atomic writes + agent prompt-level prohibition on writing `.posthog.json`.
- **Risk (medium): `cwd` traversal via `registerPreview`.** **Mitigation:** path-resolution guard in `register-preview.ts`.
- **Dependency: existing agent checkpoint system covers a no-git workspace.** Verify before Unit 5 — if not, Publish-time `git init` becomes the only undo, which the dialog should call out to the user.

## Alternative Approaches Considered

- **Hardcoded stack matrix and `git init` at scaffold time.** Both rejected per user direction (R12 and the no-git decision in Key Technical Decisions).
- **Scratchpad as a separate sidebar section ("Drafts").** Considered. Rejected: scratchpads inline with tasks, distinguished only by icon, is a simpler mental model.
- **Deterministic scaffolders (e.g. `pnpm create next-app`) for known stacks.** Considered. Rejected v1: locks the system into a stack matrix; agent-driven scaffolding is more flexible. Could add as a fast path later.
- **One giant pre-task wizard before any task is created.** Considered. Rejected: the task needs to exist for the agent session to run, and the Socratic dialog is an agent capability — implementing it as agent tool calls inside the task session is more agent-native.

## Phased Delivery

**Phase 1 — Foundations (Units 1, 2):** Service skeleton, on-disk layout, manifest, project create/rename API. Mergeable independently — no user-visible flow yet.

**Phase 2 — Creation flow + agent capabilities (Units 3, 4, 5, 6, 7):** Entry points, dialog, saga, Socratic clarification, preview pane. **Behind a feature flag** until Phase 3 lands — without clarification + preview the flow is strictly worse than the existing task flow, so we don't ship Units 3–5 user-visibly without 6–7.

**Phase 3 — Lifecycle (Units 8, 9):** Draft icon, Trash, Publish. Closes the loop from idea to GitHub. Removes the feature flag once stable.

Each phase ends in a mergeable, internally-testable state. Phase 2 is dogfood-only (gated); Phase 3 is the user-visible launch.

## Documentation / Operational Notes

- After ship, update `apps/code/ARCHITECTURE.md` (scratchpad on-disk layout + manifest schema) and capture learnings via the `ce-compound` skill.

## Sources & References

- Origin: in-conversation brainstorm (no requirements doc on disk).
- Architecture supplement: `apps/code/ARCHITECTURE.md`
- All other relevant files are cited inline as Patterns to Follow within their respective Implementation Units.
