# PostHog Code Instrumentation

All analytics events tracked from the Code app (desktop, agent, mobile).

## Desktop App — Renderer Events

Source: `apps/code/src/shared/types/analytics.ts`, tracked via `posthog-js` in the renderer process.

All renderer events include `team: "posthog-code"` as a default property.

### App Lifecycle

#### `App started`

No properties.

#### `App quit`

No properties.

### Authentication

#### `User logged in`

| Property | Type | Description |
|---|---|---|
| `email` | `string?` | User email |
| `uuid` | `string?` | User UUID |
| `project_id` | `string?` | Project ID |
| `region` | `string?` | Region |

#### `User logged out`

No properties.

### Task Management

#### `Task list viewed`

| Property | Type | Description |
|---|---|---|
| `filter_type` | `string?` | Active filter |
| `sort_field` | `string?` | Sort field |
| `view_mode` | `string?` | View mode |

#### `Task created`

| Property | Type | Description |
|---|---|---|
| `auto_run` | `boolean` | Whether the task auto-runs |
| `created_from` | `string` | `cli` or `command-menu` |
| `repository_provider` | `string?` | `github`, `gitlab`, `local`, or `none` |

#### `Task viewed`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |

#### `Task run`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `execution_type` | `string` | `cloud` or `local` |

#### `Task run started`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `execution_type` | `string` | `cloud` or `local` |
| `model` | `string?` | Model used |
| `initial_mode` | `string?` | Initial mode |
| `adapter` | `string?` | Adapter type |

#### `Task run completed`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `execution_type` | `string` | `cloud` or `local` |
| `duration_seconds` | `number` | Run duration |
| `prompts_sent` | `number` | Number of prompts sent |
| `stop_reason` | `string` | `user_cancelled`, `completed`, `error`, or `timeout` |

#### `Task run cancelled`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `execution_type` | `string` | `cloud` or `local` |
| `duration_seconds` | `number` | Run duration |
| `prompts_sent` | `number` | Number of prompts sent |

#### `Prompt sent`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `is_initial` | `boolean` | Whether it's the first prompt |
| `execution_type` | `string` | `cloud` or `local` |
| `prompt_length_chars` | `number` | Length of the prompt |

#### `Task creation failed`

| Property | Type | Description |
|---|---|---|
| `error_type` | `string` | Error classification |
| `failed_step` | `string?` | Step that failed |

#### `Task feedback`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `task_run_id` | `string?` | Task run UUID |
| `log_url` | `string?` | Log URL |
| `event_count` | `number` | Number of events |
| `feedback_type` | `string` | `good`, `bad`, or `general` |
| `feedback_comment` | `string?` | User comment |

### Repository

#### `Repository selected`

| Property | Type | Description |
|---|---|---|
| `repository_provider` | `string` | `github`, `gitlab`, `local`, or `none` |
| `source` | `string` | `task-creation` or `task-detail` |

### Git Operations

#### `Git action executed`

| Property | Type | Description |
|---|---|---|
| `action_type` | `string` | `push`, `pull`, `sync`, `publish`, `commit`, `commit-push`, `create-pr`, `view-pr`, or `update-pr` |
| `success` | `boolean` | Whether the action succeeded |
| `task_id` | `string?` | Task UUID |

#### `PR created`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string?` | Task UUID |
| `success` | `boolean` | Whether PR creation succeeded |

### File Interactions

#### `File opened`

| Property | Type | Description |
|---|---|---|
| `file_extension` | `string` | File extension |
| `source` | `string` | `sidebar`, `agent-suggestion`, `search`, or `diff` |
| `task_id` | `string?` | Task UUID |

#### `File diff viewed`

| Property | Type | Description |
|---|---|---|
| `file_extension` | `string` | File extension |
| `change_type` | `string` | `added`, `modified`, or `deleted` |
| `task_id` | `string?` | Task UUID |

#### `File tree toggled`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `visible` | `boolean` | Whether the file tree is visible |

### Workspace Events

#### `Workspace created`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `mode` | `string` | `cloud`, `worktree`, or `local` |

#### `Workspace scripts started`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `scripts_count` | `number` | Number of scripts |

#### `Folder registered`

| Property | Type | Description |
|---|---|---|
| `path_hash` | `string` | Hash of the path |

### Navigation Events

#### `Settings viewed`

No properties.

#### `Command menu opened`

No properties.

#### `Command menu action`

| Property | Type | Description |
|---|---|---|
| `action_type` | `string` | `home`, `new-task`, `settings`, `logout`, `toggle-theme`, `toggle-left-sidebar`, or `toggle-right-sidebar` |

#### `Command center viewed`

No properties.

### Permission Events

#### `Permission responded`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `tool_name` | `string?` | Tool name |
| `option_id` | `string?` | Option selected |
| `option_kind` | `string?` | Kind of option |
| `custom_input` | `string?` | Custom input value |

#### `Permission cancelled`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `tool_name` | `string?` | Tool name |

### Session Events

#### `Session config changed`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `category` | `string` | Config category |
| `from_value` | `string` | Previous value |
| `to_value` | `string` | New value |

#### `Setting changed`

| Property | Type | Description |
|---|---|---|
| `setting_name` | `string` | Setting name |
| `new_value` | `string \| boolean \| number` | New value |
| `old_value` | `string \| boolean \| number?` | Previous value |

#### `Session forked`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `original_session_id` | `string` | Original session ID |

#### `Session resumed`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `original_session_id` | `string` | Original session ID |

### Terminal Events

#### `Terminal opened`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |

### Error Events

#### `Agent session error`

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | Task UUID |
| `error_type` | `string` | Error classification |

## Agent Events

Source: `packages/agent/src/analytics.ts` and related files. Tracked via `posthog-node`.

All agent events include these base properties from the analytics context:

| Property | Type | Description |
|---|---|---|
| `team` | `string` | Always `posthog-code` |
| `session_id` | `string` | Agent session ID |
| `task_id` | `string?` | Task UUID |
| `task_run_id` | `string?` | Task run UUID |
| `adapter` | `string?` | Adapter type |
| `execution_type` | `string?` | `cloud` or `local` |

### Session Lifecycle

#### `Session created`

Source: `packages/agent/src/adapters/claude/claude-agent.ts`

| Property | Type | Description |
|---|---|---|
| `model` | `string` | Resolved model ID |
| `permission_mode` | `string` | Permission mode |

#### `Session resumed`

Same properties as `Session created`. Tracked when `isResume` is true.

#### `Session closed`

Source: `packages/agent/src/adapters/base-acp-agent.ts`

No additional properties.

### Prompt & Model

#### `Prompt completed`

Source: `packages/agent/src/adapters/claude/claude-agent.ts`

| Property | Type | Description |
|---|---|---|
| `stop_reason` | `string` | Stop reason from the model |
| `input_tokens` | `number` | Input token count |
| `output_tokens` | `number` | Output token count |
| `tool_calls_count` | `number` | Number of tool calls |

#### `Mode changed`

| Property | Type | Description |
|---|---|---|
| `previous_mode` | `string` | Previous mode |
| `new_mode` | `string` | New mode |

#### `Model changed`

| Property | Type | Description |
|---|---|---|
| `previous_model` | `string` | Previous model ID |
| `new_model` | `string` | New model ID |

#### `Effort changed`

| Property | Type | Description |
|---|---|---|
| `previous_effort` | `string` | Previous effort level |
| `new_effort` | `string` | New effort level |

#### `Session compacted`

Source: `packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts`

| Property | Type | Description |
|---|---|---|
| `pre_tokens` | `number` | Token count before compaction |

### Tool Execution

#### `Tool called`

Source: `packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `tool_kind` | `string` | Tool kind classification |

#### `Tool completed`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `tool_call_id` | `string` | Tool call ID |

### Permission Handling

Source: `packages/agent/src/adapters/claude/permissions/permission-handlers.ts`

#### `Permission requested`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `permission_mode` | `string` | Current permission mode |

#### `Permission granted`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `option_id` | `string` | Option ID selected |

#### `Permission denied`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |

#### `Permission auto allowed`

Source: `packages/agent/src/adapters/claude/hooks.ts`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `rule` | `string` | Rule that allowed it |

#### `Permission auto denied`

| Property | Type | Description |
|---|---|---|
| `tool_name` | `string` | Tool name |
| `rule` | `string` | Rule that denied it |

## Mobile App

Source: `apps/mobile/src/lib/posthog.ts`

The mobile app uses PostHog React Native SDK with:
- Automatic screen tracking via `posthog.screen()` with `pathname` and `segments` properties
- Session replay enabled (`enableSessionReplay: true`)
- Network telemetry capture (`captureNetworkTelemetry: true`)
