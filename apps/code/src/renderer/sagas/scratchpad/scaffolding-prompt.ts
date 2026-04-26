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
  rounds: number;
  /** `null` when the user opted out of linking a PostHog project. */
  projectId: number | null;
  taskId: string;
}

/**
 * Returns the verbatim scaffolding prompt text. Constraints embedded in the
 * prompt are duplicated as agent-facing rules; do not rely on this being
 * structured — it is a single text block.
 */
export function buildScaffoldingPrompt(input: ScaffoldingPromptInput): string {
  const {
    scratchpadPath,
    initialIdea,
    productName,
    rounds,
    projectId,
    taskId,
  } = input;

  return [
    `You are scaffolding a brand-new product called **${productName}** in \`${scratchpadPath}\`. The user has given you the following idea:`,
    "",
    "---",
    initialIdea,
    "---",
    "",
    "Follow this workflow:",
    "",
    `1. **Socratic clarification.** Before writing any code, run up to **${rounds}** rounds of Socratic clarification using the \`posthog_code__askClarification\` tool. Each round may include multiple questions; **every question must include a \`prefilledAnswer\`** representing your best guess so the user can accept defaults with one keystroke. Cover at minimum: app type (web/mobile/CLI/etc.), stack choice (your recommendation; the user can override), and any product-specific behaviour you can't safely guess. PostHog instrumentation is implicit — don't ask about it. Skipping clarification entirely is allowed when the request is fully specified, but encouraged for at least one round otherwise.`,
    "",
    `2. **Scaffold.** Pick a production-grade, simple, mainstream stack appropriate for the product. Run the necessary scaffolding commands inside \`${scratchpadPath}\` (e.g. \`pnpm create vite\`, \`pnpm create next-app\`, \`cargo new\`, etc.). **Never run \`git init\`** — the host is responsible for git lifecycle. Do not add any deployment scripts or hosting configuration.`,
    "",
    [
      "3. **PostHog instrumentation.** Run these slash-prompts in order, recovering inside your own loop if any step fails or installs the SDK out of order:",
      "   - `/instrument-integration`",
      "   - `/instrument-product-analytics`",
      "   - `/instrument-error-tracking`",
      "   - `/instrument-llm-analytics` (only if the product has AI/LLM features)",
      projectId === null
        ? "   No PostHog project is linked yet — the user will pick or create one at publish time. Read the API key and host from environment variables (`POSTHOG_API_KEY`, `POSTHOG_HOST`) and add a placeholder `.env.example` documenting them. Do NOT hardcode any project IDs or keys."
        : `   Use PostHog project ID \`${projectId}\` for these. Read the API key from environment variables (\`POSTHOG_API_KEY\`, \`POSTHOG_HOST\`) and add a placeholder \`.env.example\`.`,
    ].join("\n"),
    "",
    `4. **Preview registration.** Once you have a working dev server, declare it via \`posthog_code__registerPreview({ taskId: "${taskId}", name, command, port, cwd })\`. Always pass \`taskId: "${taskId}"\` — the host uses it to scope the preview to this scratchpad. Call once per process — e.g. one call for frontend, one for backend if both run. Use a \`name\` like \`"frontend"\` or \`"backend"\` for clarity.`,
    "",
    "**Hard constraints:**",
    "- You **must not** write `.posthog.json` directly — the host owns the manifest. If you need to surface preview info, use `posthog_code__registerPreview`.",
    "- You **must not** run `git init`, `git add`, `git commit`, or any git command. Rollback during ideation rides on the agent checkpoint system.",
    "- Choose a mainstream stack. No esoteric or research-grade frameworks unless the user explicitly asked.",
    `- All work happens inside \`${scratchpadPath}\`. Do not touch files outside this directory.`,
  ].join("\n");
}
