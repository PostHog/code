export const WIZARD_PROMPT = `You are setting up PostHog analytics in this repository.

Your job:
1. Look at the available skills (use the /skill slash command or browse .claude/skills/).
2. Detect which frameworks and tools this repo uses.
3. Pick the most relevant PostHog skills for this repo and execute them one by one.
4. After making all changes, create a pull request with a clear title and description summarizing what was instrumented.

Focus on: product analytics, error tracking and session replay instrumentation.
Do not ask the user questions. Run autonomously and make sensible default choices.
Commit your work with clear commit messages as you go.`;

export const DISCOVERY_PROMPT = `You are analyzing this codebase to find the highest-value first tasks for the developer.

Scan the codebase for issues in two tiers. Tier 1 applies to every repo. Tier 2 only applies when PostHog is already installed (look for posthog-js, posthog-node, posthog-react-native or similar PostHog SDK imports).

## Tier 1 -- Code health (always)

- **Dead code**: Unused exports, unreachable branches, orphaned files, stale imports. Category: dead_code
- **Duplication / KISS violations**: Copy-pasted logic that should be a shared function, over-abstracted code that could be simpler. Category: duplication
- **Security vulnerabilities**: XSS, SQL injection, command injection, hardcoded secrets, open redirects, missing auth checks, insecure deserialization. Category: security
- **Bugs**: Null dereferences, race conditions, unchecked array access, off-by-one errors, unhandled promise rejections around I/O. Category: bug
- **Performance anti-patterns**: N+1 queries, unbounded loops, synchronous blocking on hot paths, missing pagination. Category: performance

## Tier 2 -- PostHog-specific (only when PostHog SDK is detected)

- **Stale feature flags**: Flags that are always evaluated the same way, flags referenced in code but never toggled, flags guarding code that shipped long ago. Category: stale_feature_flag
- **Error tracking gaps**: Catch blocks that swallow errors without reporting, missing error boundaries, untracked 5xx responses. Category: error_tracking
- **Event tracking improvements**: Key user actions (signup, purchase, invite, upgrade) with no analytics event, events missing useful properties (plan, user role, page context). Category: event_tracking
- **Funnel weak spots**: Multi-step flows (onboarding, checkout, activation) where intermediate steps have no tracking, making drop-off invisible. Category: funnel

## Rules

- Be concrete: reference exact file paths, function names and line numbers.
- Prioritize by impact. Lead with the findings that would save the most time or prevent the most damage.
- Do NOT suggest documentation, comment or style/formatting changes.
- Maximum 4 tasks. Quality over quantity.

When you are done analyzing, call create_output with your findings.`;
