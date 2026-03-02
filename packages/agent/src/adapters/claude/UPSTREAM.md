# Upstream Sync

Fork of `@anthropic-ai/claude-agent-acp`. Upstream repo: https://github.com/anthropics/claude-code

## Fork Point

- **Forked**: v0.10.9, commit `5411e0f4`, Dec 2 2025
- **Last sync**: v0.19.2, March 2 2026 (plan-based, not direct diff)
- **SDK**: `@anthropic-ai/claude-agent-sdk` 0.2.63, `@agentclientprotocol/sdk` ^0.14.0

## File Mapping

| Twig | Upstream |
|---|---|
| `conversion/tool-use-to-acp.ts` | `tools.ts` |
| `conversion/sdk-to-acp.ts` | `sdk-to-acp.ts` |
| `conversion/acp-to-sdk.ts` | `acp-to-sdk.ts` |
| `claude-agent.ts` | `claude-code-agent.ts` |
| `permissions/*` | inline in agent |
| `session/options.ts` | inline in agent |
| `session/commands.ts` | `commands.ts` |
| `hooks.ts` | `hooks.ts` |
| `types.ts` | inline |

## Twig-Only Code (Do Not Sync)

- PostHog analytics (`_posthog/*` ext notifications)
- Process lifecycle (spawn wrappers, PID tracking)
- Plan mode (`plan/`, EnterPlanMode/ExitPlanMode handlers)
- Gateway models (`session/models.ts`, `base-acp-agent.ts`)
- AskUserQuestion handler (`questions/`)
- Execution modes and tool allowlists (`tools.ts`)
- MCP metadata caching (`mcp/`)
- Branch naming in system prompt

## What Was Synced (March 2 2026)

Bug fixes: grep output_mode snake_case, Read 1-based offsets, grep pattern null guard, abort signal in canUseTool, duplicate tool_call prevention.

Features: token usage tracking (AccumulatedUsage type, usage_update notifications), edit tool diff rendering (structuredPatch parsing, removed replaceAndCalculateLocation), prompt queueing, built-in tool disabling, MAX_THINKING_TOKENS env, image content in Read results, slash command filter update, session management (replay, list, fork, resume ext methods), terminal output streaming.

## Confidence Gaps

The March 2 sync was done from a written plan, not a direct upstream diff. These may not match upstream exactly:

- `toolUpdateFromEditToolResponse` structuredPatch shape
- `extractUsageFromResult` field names
- `replaySessionHistory` message casting
- `unstable_forkSession` session state handling
- Bash terminal output field parsing (`stdout`/`stderr`/`return_code`)

## Next Sync

1. Check upstream changelog since v0.19.2
2. Diff upstream source against Twig using the file mapping above
3. Port in phases: bug fixes first, then features
4. After each phase: `pnpm --filter agent typecheck && pnpm --filter agent build && pnpm lint`
5. After all phases: `pnpm typecheck && pnpm test`
6. Update this file
