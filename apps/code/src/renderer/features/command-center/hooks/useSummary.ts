import { useAuthStore } from "@features/auth/stores/authStore";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { useCallback, useEffect, useRef, useState } from "react";

const SYSTEM_PROMPT = `You are summarizing the result of an automated MCP query for a busy person.

Rules:
- If nothing actionable or noteworthy was found, respond with ONLY: "Nothing useful here"
- Otherwise, produce 1-3 bullet points max — only things that require action or attention
- Each bullet: one short sentence, no fluff
- Skip stats about what was scanned/checked — only surface what matters
- Bold the single most important word or phrase per bullet
- No preamble, no sign-off`;

/** Cache summaries across re-renders and component instances */
const summaryCache = new Map<string, string>();

/** Clear all cached summaries (useful when switching content sources) */
export function clearSummaryCache(): void {
  summaryCache.clear();
}

/**
 * Hook that generates an LLM summary of output text.
 * Returns the summary string (or null while loading).
 * Uses Haiku for speed and cost efficiency.
 */
export function useSummary(text: string | null | undefined): {
  summary: string | null;
  loading: boolean;
} {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(false);

  const generate = useCallback(async (content: string) => {
    // Check cache — use length + first/last chars as key to distinguish content
    const cacheKey = `${content.length}:${content.slice(0, 100)}:${content.slice(-50)}`;
    const cached = summaryCache.get(cacheKey);
    if (cached) {
      setSummary(cached);
      return;
    }

    const auth = useAuthStore.getState();
    const apiHost = auth.cloudRegion
      ? getCloudUrlFromRegion(auth.cloudRegion)
      : null;

    if (!auth.oauthAccessToken || !apiHost) {
      // No auth — use text directly as fallback
      const sep = content.indexOf("\n\n---\n");
      const fallback =
        sep !== -1 ? content.slice(0, sep).trim() : content.slice(0, 500);
      summaryCache.set(cacheKey, fallback);
      setSummary(fallback);
      return;
    }

    setLoading(true);
    abortRef.current = false;

    try {
      const result = await trpcClient.llmGateway.prompt.mutate({
        credentials: {
          apiKey: auth.oauthAccessToken,
          apiHost,
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        maxTokens: 300,
        model: "claude-haiku-4-5",
      });

      if (!abortRef.current) {
        summaryCache.set(cacheKey, result.content);
        setSummary(result.content);
      }
    } catch {
      // Fallback: use text before --- separator, or truncated raw text
      if (!abortRef.current) {
        const sep = content.indexOf("\n\n---\n");
        const fallback =
          sep !== -1 ? content.slice(0, sep).trim() : content.slice(0, 500);
        summaryCache.set(cacheKey, fallback);
        setSummary(fallback);
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    abortRef.current = false;

    if (!text) {
      setSummary(null);
      setLoading(false);
      return;
    }

    // Check cache synchronously
    const cacheKey = `${text.length}:${text.slice(0, 100)}:${text.slice(-50)}`;
    const cached = summaryCache.get(cacheKey);
    if (cached) {
      setSummary(cached);
      setLoading(false);
      return;
    }

    void generate(text);

    return () => {
      abortRef.current = true;
    };
  }, [text, generate]);

  return { summary, loading };
}
