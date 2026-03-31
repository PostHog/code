# PostHog Code Architecture

Implementation patterns for the PostHog Code desktop app. For code style and commands, see [CLAUDE.md](./CLAUDE.md).

## Overview

PostHog Code is an Electron app with a React renderer. The main process handles system operations (stateless), while the renderer owns all application state.

```
Main Process (Node.js)                      Renderer Process (React)
┌───────────────────────┐                   ┌───────────────────────────┐
│  DI Container         │                   │  DI Container             │
│  ├── GitService       │                   │  ├── TRPCClient           │
│  └── ...              │                   │  └── TaskService, ...     │
├───────────────────────┤                   ├───────────────────────────┤
│  tRPC Routers         │ ◄─tRPC(ipcLink)─► │ tRPC Clients              │
│  (use DI services)    │                   │  ├── useTRPC() (hooks)    │
├───────────────────────┤                   │  └── trpcClient (vanilla) │
│  System I/O           │                   ├───────────────────────────┤
│  (fs, git, shell)     │                   │  Zustand Stores (state)   │
│  STATELESS            │                   │  ├── taskStore            │
└───────────────────────┘                   │  ├── workspaceStore       │
                                            │  └── ...                  │
                                            ├───────────────────────────┤
                                            │  React UI                 │
                                            └───────────────────────────┘
```

**Key points:**

- Both processes use InversifyJS for DI
- Renderer DI holds services + tRPC client; services can coordinate stores
- Zustand stores own all application state (not in DI)
- Main process is stateless - pure I/O operations only

## Dependency Injection

Both processes use [InversifyJS](https://inversify.io/) for dependency injection with singleton scope.

| Process  | Container          | Holds                                 |
| -------- | ------------------ | ------------------------------------- |
| Main     | `src/main/di/`     | Stateless services (GitService, etc.) |
| Renderer | `src/renderer/di/` | Services + TRPCClient                 |

### Defining a Service

```typescript
// src/main/services/my-service/service.ts (or src/renderer/services/)
import { injectable } from "inversify"

@injectable()
export class MyService {
  doSomething() {
    // ...
  }
}
```

### Registering a Service

```typescript
// src/main/di/container.ts (or src/renderer/di/container.ts)
container.bind<MyService>(TOKENS.MyService).to(MyService)
```

```typescript
// src/main/di/tokens.ts (or src/renderer/di/tokens.ts)
export const MAIN_TOKENS = Object.freeze({
  MyService: Symbol.for("Main.MyService"),
})
```

### Injecting Dependencies

Services should declare dependencies via constructor injection:

```typescript
import { inject, injectable } from "inversify"
import { MAIN_TOKENS } from "../di/tokens"

@injectable()
export class MyService {
  constructor(
    @inject(MAIN_TOKENS.OtherService)
    private readonly otherService: OtherService,
  ) {}

  doSomething() {
    return this.otherService.getData()
  }
}
```

### Using Services in tRPC Routers

tRPC routers resolve services from the container:

```typescript
import { container } from "../../di/container"
import { MAIN_TOKENS } from "../../di/tokens"

const getService = () => container.get<MyService>(MAIN_TOKENS.MyService)

export const myRouter = router({
  getData: publicProcedure.query(() => getService().getData()),
})
```

### Testing with Mocks

Constructor injection makes testing straightforward:

```typescript
// Direct instantiation with mock
const mockOtherService = { getData: vi.fn().mockReturnValue("test") }
const service = new MyService(mockOtherService as OtherService)

// Or rebind in container for integration tests
container.snapshot()
container.rebind(MAIN_TOKENS.OtherService).toConstantValue(mockOtherService)
// ... run tests ...
container.restore()
```

## IPC via tRPC

We use [tRPC](https://trpc.io/) with [trpc-electron](https://github.com/jsonnull/electron-trpc) for type-safe communication between main and renderer. The `ipcLink()` handles serialization over Electron IPC.

### Creating a Router (Main Process)

```typescript
// src/main/trpc/routers/my-router.ts
import { container } from "../../di/container"
import { MAIN_TOKENS } from "../../di/tokens"
import {
  getDataInput,
  getDataOutput,
  updateDataInput,
} from "../../services/my-service/schemas"
import { router, publicProcedure } from "../trpc"

const getService = () => container.get<MyService>(MAIN_TOKENS.MyService)

export const myRouter = router({
  getData: publicProcedure
    .input(getDataInput)
    .output(getDataOutput)
    .query(({ input }) => getService().getData(input.id)),

  updateData: publicProcedure
    .input(updateDataInput)
    .mutation(({ input }) => getService().updateData(input.id, input.value)),
})
```

### Registering the Router

```typescript
// src/main/trpc/router.ts
import { myRouter } from "./routers/my-router"

export const trpcRouter = router({
  my: myRouter,
  // ...
})
```

### Using tRPC in Renderer

There are three tRPC exports, each for a different context:

| Export       | Where to use                                   | Purpose                                                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `useTRPC()`  | React components/hooks                         | Options proxy via React context                                          |
| `trpc`       | Outside React (module scope, services, stores) | Options proxy bound to the singleton `queryClient`                       |
| `trpcClient` | Anywhere (imperative calls)                    | Vanilla tRPC client for direct `.query()` / `.mutate()` / `.subscribe()` |

**React components** use `useTRPC()` + TanStack Query hooks:

```typescript
import { useTRPC } from "@renderer/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"

function MyComponent() {
  const trpc = useTRPC()

  // Queries — pass queryOptions() to useQuery
  const { data } = useQuery(trpc.my.getData.queryOptions({ id: "123" }))

  // Mutations — pass mutationOptions() to useMutation
  const mutation = useMutation(
    trpc.my.updateData.mutationOptions({
      onSuccess: () => {
        /* ... */
      },
    }),
  )
  const handleUpdate = () => mutation.mutate({ id: "123", value: "new" })
}
```

**Subscriptions** use `useSubscription` from `@trpc/tanstack-react-query`:

```typescript
import { useSubscription } from "@trpc/tanstack-react-query"

useSubscription(
  trpc.my.onItemCreated.subscriptionOptions(undefined, {
    onData: (item) => {
      /* ... */
    },
  }),
)
```

**Cache invalidation** uses `pathFilter()` or `queryFilter()` with the query client:

```typescript
const queryClient = useQueryClient()

// Invalidate all queries under a router path
queryClient.invalidateQueries(trpc.workspace.getAll.pathFilter())

// Invalidate a specific query by input
queryClient.invalidateQueries(
  trpc.git.getCurrentBranch.queryFilter({ directoryPath: repoPath }),
)

// Set cache data directly
queryClient.setQueryData(
  trpc.git.getLatestCommit.queryKey({ directoryPath: repoPath }),
  commitData,
)
```

**Outside React** (stores, sagas, services, module-scope utilities):

```typescript
// Imperative calls — use trpcClient
import { trpcClient } from "@renderer/trpc/client"

const data = await trpcClient.my.getData.query({ id: "123" })
await trpcClient.my.updateData.mutate({ id: "123", value: "new" })

// Cache operations outside React — use trpc (the module-level options proxy)
import { trpc } from "@renderer/trpc"
import { queryClient } from "@utils/queryClient"

queryClient.invalidateQueries(trpc.workspace.getAll.pathFilter())
```

## State Management

**All application state lives in the renderer.** Main process services should be stateless/pure.

| Layer        | State          | Role                                         |
| ------------ | -------------- | -------------------------------------------- |
| **Renderer** | Zustand stores | Owns all application state                   |
| **Main**     | Stateless      | Pure operations (file I/O, git, shell, etc.) |

This keeps state predictable, easy to debug, and naturally supports patterns like undo/rollback.

### Example

```typescript
// ❌ Bad - main service with state
@injectable()
class TaskService {
  private currentTask: Task | null = null // Don't do this
}

// ✅ Good - main service is pure
@injectable()
class TaskService {
  async readTask(id: string): Promise<Task> {
    /* ... */
  }
  async writeTask(task: Task): Promise<void> {
    /* ... */
  }
}

// ✅ Good - state lives in renderer
// src/renderer/stores/task-store.ts
const useTaskStore = create<TaskState>((set) => ({
  currentTask: null,
  setCurrentTask: (task) => set({ currentTask: task }),
}))
```

### Learned Hints

The settings store (`src/renderer/features/settings/stores/settingsStore.ts`) provides a reusable "learned hints" system for progressive feature discovery. Hints are shown a limited number of times until the user demonstrates they've learned the behavior.

```typescript
// In the store: hints is Record<string, { count: number; learned: boolean }>
const store = useFeatureSettingsStore.getState()

// Check if a hint should still be shown (max N times, not yet learned)
if (store.shouldShowHint("my-hint-key", 3)) {
  store.recordHintShown("my-hint-key")
  toast.info("Did you know?", "You can do X with Y.")
}

// When the user demonstrates the behavior, mark it learned (stops showing)
store.markHintLearned("my-hint-key")
```

Hint state is persisted via `electronStorage`. Use this pattern instead of ad-hoc boolean flags when introducing new discoverable features.

## Services

Services encapsulate business logic and exist in both processes:

- **Main services** (`src/main/services/`) - System operations (file I/O, git, shell)
- **Renderer services** (`src/renderer/services/`) - UI logic, API calls

Main services should be:

- **Injectable**: Decorated with `@injectable()` for DI
- **Stateless**: No mutable instance state, pure operations only
- **Single responsibility**: One concern per service

### Service Structure

```
src/main/services/
├── my-service/
│   ├── service.ts      # The injectable service class
│   ├── schemas.ts      # Zod schemas for tRPC input/output
│   └── types.ts        # Internal types (not exposed via tRPC)

src/renderer/services/
├── my-service.ts       # Renderer-side service
```

### Zod Schemas

All tRPC inputs and outputs use Zod schemas as the single source of truth. Types are inferred from schemas.

```typescript
// src/main/services/my-service/schemas.ts
import { z } from "zod"

export const getDataInput = z.object({
  id: z.string(),
})

export const getDataOutput = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
})

export type GetDataInput = z.infer<typeof getDataInput>
export type GetDataOutput = z.infer<typeof getDataOutput>
```

```typescript
// src/main/trpc/routers/my-router.ts
import { getDataInput, getDataOutput } from "../../services/my-service/schemas"

export const myRouter = router({
  getData: publicProcedure
    .input(getDataInput)
    .output(getDataOutput)
    .query(({ input }) => getService().getData(input.id)),
})
```

```typescript
// src/main/services/my-service/service.ts
import type { GetDataInput, GetDataOutput } from "./schemas"

@injectable()
export class MyService {
  async getData(id: string): Promise<GetDataOutput> {
    // ...
  }
}
```

This pattern provides:

- Runtime validation of inputs and outputs
- Single source of truth for types
- Explicit API contracts between main and renderer

## Adding a New Feature

1. **Create the service** in `src/main/services/`
2. **Add DI token** in `src/main/di/tokens.ts`
3. **Register service** in `src/main/di/container.ts`
4. **Create tRPC router** in `src/main/trpc/routers/`
5. **Add router** to `src/main/trpc/router.ts`
6. **Use in renderer** via `useTRPC()` + TanStack Query hooks

## Events (tRPC Subscriptions)

For pushing real-time updates from main to renderer, use tRPC subscriptions with typed event emitters.

### 1. Define Events in schemas.ts

Use a const object for event names and an interface for payloads:

```typescript
// src/main/services/my-service/schemas.ts
export const MyServiceEvent = {
  ItemCreated: "item-created",
  ItemDeleted: "item-deleted",
} as const

export interface MyServiceEvents {
  [MyServiceEvent.ItemCreated]: { id: string; name: string }
  [MyServiceEvent.ItemDeleted]: { id: string }
}
```

### 2. Extend TypedEventEmitter in Service

```typescript
// src/main/services/my-service/service.ts
import { TypedEventEmitter } from "../../lib/typed-event-emitter"
import { MyServiceEvent, type MyServiceEvents } from "./schemas"

@injectable()
export class MyService extends TypedEventEmitter<MyServiceEvents> {
  async createItem(name: string) {
    const item = { id: "123", name }
    // TypeScript enforces correct event name and payload shape
    this.emit(MyServiceEvent.ItemCreated, item)
    return item
  }
}
```

### 3. Create Subscriptions in Router

Use `toIterable()` on the service to convert events to an async iterable. For global events (broadcast to all subscribers):

```typescript
// src/main/trpc/routers/my-router.ts
import {
  MyServiceEvent,
  type MyServiceEvents,
} from "../../services/my-service/schemas"

function subscribe<K extends keyof MyServiceEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService()
    const iterable = service.toIterable(event, { signal: opts.signal })
    for await (const data of iterable) {
      yield data
    }
  })
}

export const myRouter = router({
  // ... queries and mutations
  onItemCreated: subscribe(MyServiceEvent.ItemCreated),
  onItemDeleted: subscribe(MyServiceEvent.ItemDeleted),
})
```

For per-instance events (e.g., shell sessions), filter by an identifier:

```typescript
// Events include an identifier to filter on
export interface ShellEvents {
  [ShellEvent.Data]: { sessionId: string; data: string }
  [ShellEvent.Exit]: { sessionId: string; exitCode: number }
}

// Router filters events to the specific session
function subscribeFiltered<K extends keyof ShellEvents>(event: K) {
  return publicProcedure
    .input(sessionIdInput)
    .subscription(async function* (opts) {
      const service = getService()
      const targetSessionId = opts.input.sessionId
      const iterable = service.toIterable(event, { signal: opts.signal })

      for await (const data of iterable) {
        if (data.sessionId === targetSessionId) {
          yield data
        }
      }
    })
}

export const shellRouter = router({
  onData: subscribeFiltered(ShellEvent.Data),
  onExit: subscribeFiltered(ShellEvent.Exit),
})
```

### 4. Subscribe in Renderer

```typescript
import { useSubscription } from "@trpc/tanstack-react-query"

const trpc = useTRPC()

// React component - global events
useSubscription(
  trpc.my.onItemCreated.subscriptionOptions(undefined, {
    enabled: true,
    onData: (item) => {
      // item is typed as { id: string; name: string }
    },
  }),
)

// React component - per-session events
useSubscription(
  trpc.shell.onData.subscriptionOptions(
    { sessionId },
    {
      enabled: !!sessionId,
      onData: (event) => {
        // event is typed as { sessionId: string; data: string }
        terminal.write(event.data)
      },
    },
  ),
)
```

## MCP Apps

MCP Apps let MCP servers ship interactive HTML UIs alongside their tools. When a tool has an associated `ui://` resource, we render the app's HTML inside a sandboxed iframe instead of showing the raw tool input/output.

### How It Works

```
Agent Session                      Main Process                    Renderer
┌──────────────┐                  ┌─────────────────────┐          ┌───────────────────────────┐
│ Tool call    │─-session/update─►│ AgentService        │          │ McpToolBlock              │
│ (mcp__X__Y)  │                  │  ├─notifyToolInput  │──event──►│  ├─ hasUiForTool?         │
│              │                  │  └─notifyToolResult │──event──►│  ├─ McpAppHost            │
└──────────────┘                  ├─────────────────────┤          │  │  ├─ iframe (sandbox).  │
                                  │ McpAppsService      │          │  │  └─ useAppBridge       │
                                  │  ├─ connections     │◄─proxy───│  └─ McpToolView (fallback)│
                                  │  ├─ resourceCache   │          └───────────────────────────┘
                                  │  └─ toolAssociations│
                                  └─────────────────────┘
```

On session start, `AgentService` passes the active MCP server configs to `McpAppsService`, which connects to each server over Streamable HTTP and discovers UI resources. It lists the server's resources looking for `ui://` URIs with mime type `text/html;profile=mcp-app`, then maps each resource to its associated tool via the tool's `_meta.ui.resourceUri` field. The HTML content is fetched and cached in memory (capped at 5MB per resource).

### Shared Types

Schemas and event types for MCP Apps live in `src/shared/types/mcp-apps.ts` rather than in the service directory, since both processes need them. This file defines the Zod schemas for tRPC input/output, the `McpUiResource` interface, tool-to-UI association types, and the `McpAppsServiceEvent` constants.

### Main Process

`McpAppsService` (`src/main/services/mcp-apps/service.ts`) manages MCP server connections and acts as a proxy between the renderer and remote MCP servers. It extends `TypedEventEmitter` to push tool input/result/cancellation events to the renderer via tRPC subscriptions.

`AgentService` hooks into the ACP `sessionUpdate` callback to intercept tool call updates for MCP tools (those prefixed with `mcp__`). It forwards tool inputs and results to `McpAppsService`, which re-emits them as typed events.

The tRPC router (`src/main/trpc/routers/mcp-apps.ts`) exposes:

- `getUiResource` / `hasUiForTool` — queries for UI resource lookup
- `proxyToolCall` / `proxyResourceRead` — mutations that forward calls to the remote MCP server, with visibility checks (tools marked as model-only are rejected)
- `openLink` — opens URLs via `shell.openExternal`, restricted to http/https
- `onToolInput` / `onToolResult` / `onToolCancelled` — per-tool filtered subscriptions

### Renderer

The renderer feature lives in `src/renderer/features/mcp-apps/`:

```
mcp-apps/
├── components/
│   ├── McpToolBlock.tsx         # McpToolView + optional McpAppHost below
│   ├── McpAppHost.tsx           # Iframe host with inline/fullscreen display modes
│   └── McpToolView.tsx          # Standard MCP tool call rendering (moved from sessions/)
├── hooks/
│   └── useAppBridge.ts          # AppBridge lifecycle, message routing, context sync
└── utils/
    ├── mcp-app-csp.ts           # CSP generation from server-declared domains
    ├── mcp-app-sandbox-proxy.ts # Generates the outer sandbox iframe HTML
    ├── mcp-app-host-utils.ts    # Tool key parsing, container dimension helpers
    └── mcp-app-theme.ts         # Maps Radix theme tokens to MCP App CSS variables
```

`McpToolBlock` is the entry point, rendered from `ToolCallBlock` for any `mcp__` tool. It always renders `McpToolView` (the pre-existing MCP tool call display, moved here from `sessions/`). When the tool has a UI resource and the server isn't disabled in settings, it additionally renders `McpAppHost` below the tool view. This keeps the standard tool call display (input preview, status, expandable output) visible regardless of whether an app is present.

### Sandbox Model

Apps run inside a double-iframe sandbox. The outer iframe loads a generated proxy page (`mcp-app-sandbox-proxy.ts`) with `sandbox="allow-scripts allow-same-origin ..."`. The proxy receives the app's HTML from the host via postMessage and injects it into an inner iframe with a server-declared CSP meta tag. This isolates the app's DOM from the host while still allowing structured communication over the bridge.

### App Bridge

`useAppBridge` manages the host side of the `@modelcontextprotocol/ext-apps` `AppBridge`. It handles the full lifecycle: waiting for the sandbox proxy to signal readiness, creating the bridge with a `PostMessageTransport`, sending the HTML resource into the inner iframe, and tearing down on unmount.

The bridge routes app requests to tRPC mutations in the main process — tool calls, resource reads, and link opens all proxy through `McpAppsService`. It also forwards host context changes (theme, display mode, container dimensions) to the app when those values change, and handles app-initiated actions like display mode requests and messages that get routed to the draft store.

`sendWhenReady` buffers bridge calls until the app has finished its initialization handshake, then flushes them. This lets the component forward tool results from tRPC subscriptions without worrying about race conditions with app startup.

### Disabling MCP Apps

Users can disable MCP Apps per server via `settingsStore.mcpAppsDisabledServers`. When a server is disabled, `McpAppsService` skips connecting to it and the renderer falls back to `McpToolView`.

## Code Style

See [CLAUDE.md](./CLAUDE.md) for linting, formatting, and import conventions.

Key points:

- Use path aliases (`@main/*`, `@renderer/*`, etc.)
- No barrel files - import directly from source
- Use `logger` instead of `console.*`
