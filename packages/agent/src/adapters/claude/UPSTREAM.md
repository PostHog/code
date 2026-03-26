# Upstream Sync

Fork of `@anthropic-ai/claude-agent-acp`. Upstream repo: https://github.com/anthropics/claude-code

## Fork Point

- **Forked**: v0.10.9, commit `5411e0f4`, Dec 2 2025
- **Last sync**: v0.22.2, commit `07db59e`, March 25 2026
- **SDK**: `@anthropic-ai/claude-agent-sdk` 0.2.76, `@agentclientprotocol/sdk` 0.16.1

## File Mapping

| PostHog Code | Upstream |
|---|---|
| `conversion/tool-use-to-acp.ts` | `tools.ts` |
| `conversion/sdk-to-acp.ts` | inline in `acp-agent.ts` |
| `conversion/acp-to-sdk.ts` | inline in `acp-agent.ts` |
| `claude-agent.ts` | `acp-agent.ts` |
| `permissions/*` | inline in `acp-agent.ts` |
| `session/options.ts` | inline in `acp-agent.ts` |
| `session/commands.ts` | inline in `acp-agent.ts` |
| `hooks.ts` | `tools.ts` |
| `types.ts` | inline |

## PostHog Code-Only Code (Do Not Sync)

- PostHog analytics (`_posthog/*` ext notifications, `_posthog/usage_update`)
- Process lifecycle (spawn wrappers, PID tracking, `onProcessSpawned`/`onProcessExited`)
- Plan mode (`plan/`, EnterPlanMode/ExitPlanMode handlers, plan validation)
- Gateway models (`session/models.ts`, `base-acp-agent.ts`, `fetchGatewayModels`)
- AskUserQuestion handler (`questions/`, `CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL`)
- Execution modes and tool allowlists (`tools.ts`, `CodeExecutionMode`)
- MCP metadata caching (`mcp/`)
- Branch naming in system prompt
- `broadcastUserMessage` in prompt()
- `interruptReason` on cancel
- `SYSTEM_REMINDER` stripping from Read tool results
- WebFetch `resourceLink` content enrichment
- `customTitle` in listSessions (PostHog Code is ahead of upstream here)
- SettingsManager `PreToolUse` hook for permission rules
- `ensureLocalSettings` / `clearStatsigCache`
- `ELECTRON_RUN_AS_NODE` / `ENABLE_TOOL_SEARCH` env vars

## Intentional Divergences

| Area | Upstream | PostHog Code | Reason |
|---|---|---|---|
| AskUserQuestion | Always disallowed | Enabled via env var + permission handler | PostHog Code supports structured questions |
| Model resolution | `initializationResult.models` from SDK | `fetchGatewayModels()` from gateway API | Different model backend |
| permissionMode | Hardcoded `"default"` | Reads from `meta.permissionMode` | More flexible mode selection |
| Session storage | `this.sessions[sessionId]` (multi) | `this.session` (single) | Architectural choice |
| bypassPermissions | `updatedPermissions` with `destination: "session"` | No `updatedPermissions` | Different permission persistence |
| Auth methods | Always returns `claude-login` auth method | Returns empty `authMethods` | Auth handled externally |

## Next Sync

1. Check upstream changelog since v0.22.2
2. Diff upstream source against PostHog Code using the file mapping above
3. Port in phases: bug fixes first, then features
4. After each phase: `pnpm --filter agent typecheck && pnpm --filter agent build && pnpm lint`
5. After all phases: `pnpm typecheck && pnpm test`
6. Update this file
