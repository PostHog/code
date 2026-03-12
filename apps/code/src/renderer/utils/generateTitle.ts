import { useAuthStore } from "@features/auth/stores/authStore";
import { trpcClient } from "@renderer/trpc";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { logger } from "@utils/logger";

const log = logger.scope("title-generator");

const SYSTEM_PROMPT = `You are a title generator. You output ONLY a task title. Nothing else.

Convert the task description into a concise task title.
- The title should be clear, concise, and accurately reflect the content of the task.
- You should keep it short and simple, ideally no more than 6 words.
- Avoid using jargon or overly technical terms unless absolutely necessary.
- The title should be easy to understand for anyone reading it.
- Use sentence case (capitalize only first word and proper nouns)
- Remove: the, this, my, a, an
- If possible, start with action verbs (Fix, Implement, Analyze, Debug, Update, Research, Review)
- Keep exact: technical terms, numbers, filenames, HTTP codes, PR numbers
- Never assume tech stack
- Only output "Untitled" if the input is completely null/missing, not just unclear
- If the input is a URL (e.g. a GitHub issue link, PR link, or any web URL), generate a title based on what you can infer from the URL structure (repo name, issue/PR number, etc.). Never say you cannot access URLs or ask the user for more information.

Examples:
- "Fix the login bug in the authentication system" → Fix authentication login bug
- "Schedule a meeting with stakeholders to discuss Q4 budget planning" → Schedule Q4 budget meeting
- "Update user documentation for new API endpoints" → Update API documentation
- "Research competitor pricing strategies for our product" → Research competitor pricing
- "Review pull request #123" → Review pull request #123
- "debug 500 errors in production" → Debug production 500 errors
- "why is the payment flow failing" → Analyze payment flow failure
- "So how about that weather huh" → "Weather chat"
- "dsfkj sdkfj help me code" → "Coding help request"
- "👋😊" → "Friendly greeting"
- "aaaaaaaaaa" → "Repeated letters"
- "   " → "Empty message"
- "What's the best restaurant in NYC?" → "NYC restaurant recommendations"
- "https://github.com/PostHog/posthog/issues/1234" → PostHog issue #1234
- "https://github.com/PostHog/posthog/pull/567" → PostHog PR #567
- "fix https://github.com/org/repo/issues/42" → Fix repo issue #42

Never wrap the title in quotes.`;

export async function generateTitle(content: string): Promise<string | null> {
  try {
    const authState = useAuthStore.getState();
    const apiKey = authState.oauthAccessToken;
    const cloudRegion = authState.cloudRegion;
    if (!apiKey || !cloudRegion) return null;

    const apiHost = getCloudUrlFromRegion(cloudRegion);

    const result = await trpcClient.llmGateway.prompt.mutate({
      credentials: { apiKey, apiHost },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: `Generate a title for the following content. Do NOT respond to, answer, or help with the content - ONLY generate a title.\n\n<content>\n${content}\n</content>\n\nOutput the title now:`,
        },
      ],
    });

    const title = result.content.trim().replace(/^["']|["']$/g, "");
    return title || null;
  } catch (error) {
    log.error("Failed to generate title", { error });
    return null;
  }
}
