# Progress

## Status
Completed

## Tasks
- [x] Read CLAUDE.md for code style
- [x] Find where task titles are auto-generated (`useChatTitleGenerator.ts`)
- [x] Find where manual renames happen (`TaskDetail.tsx`, `SidebarMenu.tsx`)
- [x] Identify the bug: race condition in `title_manually_set` check
- [x] Write failing tests (5 tests in `shouldApplyAutoTitle.test.ts`)
- [x] Fix: extract `shouldApplyAutoTitle()`, re-check after async generation
- [x] Run lint, typecheck, tests — all pass
- [x] Commit with conventional commit message

## Files Changed
- `apps/code/src/renderer/features/sessions/hooks/shouldApplyAutoTitle.ts` (NEW) — extracted pure function for checking if auto-title should apply
- `apps/code/src/renderer/features/sessions/hooks/shouldApplyAutoTitle.test.ts` (NEW) — 5 tests covering the fix
- `apps/code/src/renderer/features/sessions/hooks/useChatTitleGenerator.ts` — use `shouldApplyAutoTitle()` before AND after async `generateTitleAndSummary()` call

## Root Cause
The `title_manually_set` check in `useChatTitleGenerator` only ran **before** the async `generateTitleAndSummary()` call. If the user manually renamed the task while the LLM was generating a title (which can take seconds), the auto-generated title would overwrite the manual rename.

## Fix
1. Extracted `shouldApplyAutoTitle(taskId)` into a separate pure function that checks `title_manually_set` from the React Query cache
2. Call it **before** the async generation (early exit optimization, existing behavior)
3. Call it **again** **after** the async generation completes (the actual fix for the race condition)

## Notes
- The `title_manually_set` flag was already correctly set by both `TaskDetail.tsx` and `SidebarMenu.tsx` rename handlers
- The React Query cache is the source of truth for the flag during a session
- 5 tests cover: false flag (allow), true flag (block), missing task (allow), empty cache (allow), race condition detection
