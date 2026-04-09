import type {
  EnricherApiConfig,
  EventDefinition,
  EventStats,
  Experiment,
  FeatureFlag,
} from "./types.js";

export class PostHogApi {
  private config: EnricherApiConfig;

  constructor(config: EnricherApiConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    const host = this.config.host.replace(/\/$/, "");
    return `${host}/api/projects/${this.config.projectId}`;
  }

  private get signal(): AbortSignal {
    return AbortSignal.timeout(this.config.timeoutMs ?? 10_000);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: this.signal,
    });
    if (!res.ok) {
      throw new Error(
        `PostHog API error: ${res.status} ${res.statusText} on GET ${path}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: this.signal,
    });
    if (!res.ok) {
      throw new Error(
        `PostHog API error: ${res.status} ${res.statusText} on POST ${path}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    const data = await this.get<{ results: FeatureFlag[] }>(
      "/feature_flags/?limit=500",
    );
    return data.results.filter((f) => !f.deleted);
  }

  async getExperiments(): Promise<Experiment[]> {
    const data = await this.get<{ results: Experiment[] }>(
      "/experiments/?limit=500",
    );
    return data.results;
  }

  async getEventDefinitions(names?: string[]): Promise<EventDefinition[]> {
    let path = "/event_definitions/?limit=500";
    if (names && names.length > 0) {
      path += `&search=${encodeURIComponent(names.join(","))}`;
    }
    const data = await this.get<{ results: EventDefinition[] }>(path);
    return data.results;
  }

  async getEventStats(
    eventNames: string[],
    daysBack = 30,
  ): Promise<Map<string, EventStats>> {
    if (eventNames.length === 0) {
      return new Map();
    }

    const query = `
      SELECT
        event,
        count() AS volume,
        count(DISTINCT person_id) AS unique_users,
        max(timestamp) AS last_seen
      FROM events
      WHERE event IN ({eventNames:Array(String)})
        AND timestamp >= now() - INTERVAL {daysBack:Int32} DAY
      GROUP BY event
    `;

    const data = await this.post<{
      results: [string, number, number, string][];
    }>("/query/", {
      query: {
        kind: "HogQLQuery",
        query,
        values: { eventNames, daysBack },
      },
    });

    const stats = new Map<string, EventStats>();
    for (const [event, volume, uniqueUsers, lastSeen] of data.results) {
      stats.set(event, {
        volume,
        uniqueUsers,
        lastSeenAt: lastSeen || null,
      });
    }
    return stats;
  }
}
