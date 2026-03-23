import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = "sTMFPsFhdP1Ssg";
const POSTHOG_HOST = "https://us.i.posthog.com";

let _client: PostHog | undefined;

function getPostHogClient(): PostHog {
  if (!_client) {
    const apiKey = process.env.POSTHOG_ANALYTICS_API_KEY ?? POSTHOG_API_KEY;
    const host = process.env.POSTHOG_ANALYTICS_HOST ?? POSTHOG_HOST;
    _client = new PostHog(apiKey, {
      host,
      flushAt: 10,
      flushInterval: 5000,
    });
  }
  return _client;
}

export type AnalyticsContext = {
  distinctId: string;
  sessionId: string;
  taskId?: string;
  taskRunId?: string;
  adapter?: string;
  executionType?: string;
};

let _context: AnalyticsContext | undefined;

export function setAnalyticsContext(context: AnalyticsContext): void {
  _context = context;
}

export function getAnalyticsContext(): AnalyticsContext | undefined {
  return _context;
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ctx = _context;
  if (!ctx) return;

  try {
    getPostHogClient().capture({
      distinctId: ctx.distinctId,
      event,
      properties: {
        team: "posthog-code",
        session_id: ctx.sessionId,
        task_id: ctx.taskId,
        task_run_id: ctx.taskRunId,
        adapter: ctx.adapter,
        execution_type: ctx.executionType,
        ...properties,
      },
    });
  } catch {
    // Analytics failures should never break agent functionality
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = undefined;
  }
}
