/**
 * Builds the scaffolding instructions delivered to the agent as the first
 * user message of a scratchpad-creation session. The agent receives this as
 * a `text` content block via `ConnectParams.initialPrompt`, which is
 * functionally equivalent to a system-prompt addon while reusing existing
 * plumbing (see `apps/code/src/renderer/features/sessions/service/service.ts`
 * `ConnectParams.initialPrompt`).
 */

export interface ScaffoldingPromptInput {
  scratchpadPath: string;
  initialIdea: string;
  productName: string;
  /** `null` when the user opted out of linking a PostHog project. */
  projectId: number | null;
  taskId: string;
  /**
   * Maximum number of Socratic clarification rounds the agent should run
   * before scaffolding. The agent uses Claude's native `AskUserQuestion`
   * tool — there is no host-side enforcement, this is a budget hint.
   */
  rounds: number;
}

/**
 * Returns the verbatim scaffolding prompt text. The agent reads this as
 * markdown — keep it human-readable, keep guardrails explicit, and don't
 * rely on structured parsing.
 */
export function buildScaffoldingPrompt(input: ScaffoldingPromptInput): string {
  const {
    scratchpadPath,
    initialIdea,
    productName,
    projectId,
    taskId,
    rounds,
  } = input;

  const instrumentationProjectNote =
    projectId === null
      ? "No PostHog project is linked yet — the user will pick or create one at publish time. Read the API key and host from environment variables (`POSTHOG_API_KEY`, `POSTHOG_HOST`) and add a placeholder `.env.example` documenting them. Do NOT hardcode any project IDs or keys."
      : `Use PostHog project ID \`${projectId}\` for these. Read the API key from environment variables (\`POSTHOG_API_KEY\`, \`POSTHOG_HOST\`) and add a placeholder \`.env.example\`.`;

  return `You are scaffolding a brand-new app called **${productName}** in \`${scratchpadPath}\`. The user has given you the following idea:

---
${initialIdea}
---

**Before you start anything else**, send a short message to the user (one or two sentences) telling them what to expect: that you'll ask a few quick clarifying questions, then scaffold a minimal version and **stand up a live preview as fast as possible** so they can see it taking shape — features and styling iterate from there. Then proceed with the workflow below.

Follow this workflow:

1. **Socratic clarification.** Before writing any code, run **up to ${rounds} round${rounds === 1 ? "" : "s"}** of clarifying questions using your built-in \`AskUserQuestion\` tool. One round = one \`AskUserQuestion\` call (which can bundle several related questions). Cover at minimum: app type (web/mobile/CLI/etc.), stack choice (your recommendation; the user can override), and any product-specific behaviour you can't safely guess. Stop early if you've got enough to scaffold — no need to use the full budget when the request is already fully specified. PostHog instrumentation is implicit — don't ask about it.

2. **Scaffold the bare minimum that runs.** Pick a production-grade, simple, mainstream stack appropriate for the product (e.g. \`pnpm create vite\`, \`pnpm create next-app\`, \`cargo new\`, etc.) and get it to a state where \`pnpm dev\` (or equivalent) starts a working dev server — even with placeholder content. Optimize for **speed to first preview**: run the scaffolder, install dependencies, do not yet build out features or polish UI. The directory is already a fresh \`git\` repo on \`main\` with no commits — you can use \`git\` normally, but **do NOT run \`git init\`** in subdirectories or scaffolders that try to (pass \`--no-git\`/equivalent flags). Do not add deployment scripts or hosting configuration.

3. **Start the dev server and register the preview NOW.** As soon as you have anything that boots, kick off the dev server and declare it via \`posthog_code__registerPreview({ taskId: "${taskId}", name, command, port, cwd })\` (always pass \`taskId: "${taskId}"\`; \`name\` should be \`"frontend"\` / \`"backend"\` / etc.). The user sees a live preview tab open the moment the server is up — get them there before you start filling in features. If the product has both a frontend and a backend, register them as you bring each up; you do not have to wait for both.

   **For any product with a UI, design with intentionality.** Before you write a single line of styling beyond the scaffolder defaults, WebFetch Anthropic's \`frontend-design\` skill from \`https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md\` and follow it like a loaded skill — that file IS the skill. If the fetch fails, hold yourself to the same bar inline: pick a distinctive aesthetic direction, distinctive typography (no Inter/Arial/Roboto), dominant color + sharp accents (no cliché purple-on-white gradients), and at least one unforgettable choice.

4. **Build it out.** With the preview running and the user watching, iterate on features and UI. Re-saving files is fine — most dev servers HMR. If you have to restart the server, that's also fine; \`registerPreview\` re-registration just updates the URL. Keep the user informed about what you're doing.

5. **PostHog instrumentation.** Once the app is taking shape, wire up PostHog. Run these slash-prompts in order, recovering inside your own loop if any step fails or installs the SDK out of order:
   - \`/instrument-integration\`
   - \`/instrument-product-analytics\`
   - \`/instrument-error-tracking\`
   - \`/instrument-llm-analytics\` (only if the product has AI/LLM features)

   ${instrumentationProjectNote}

**Hard constraints:**
- You **must not** write \`.posthog.json\` directly — the host owns the manifest. If you need to surface preview info, use \`posthog_code__registerPreview\`.
- Do not push to a remote, add a remote, or otherwise publish — Publish is a separate user-driven action.
- Choose a mainstream stack. No esoteric or research-grade frameworks unless the user explicitly asked.
- All work happens inside \`${scratchpadPath}\`. Do not touch files outside this directory.`;
}
