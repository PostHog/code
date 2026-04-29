export interface DiscoveredTask {
  id: string;
  title: string;
  description: string;
  category:
    | "bug"
    | "security"
    | "dead_code"
    | "duplication"
    | "performance"
    | "stale_feature_flag"
    | "error_tracking"
    | "event_tracking"
    | "funnel";
  file?: string;
  lineHint?: number;
}

export const TASK_DISCOVERY_JSON_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "A short kebab-case identifier" },
          title: {
            type: "string",
            description: "One-line summary of the task",
          },
          description: {
            type: "string",
            description:
              "2-3 sentences explaining the problem and what to fix, including file path and line if known",
          },
          category: {
            type: "string",
            enum: [
              "bug",
              "security",
              "dead_code",
              "duplication",
              "performance",
              "stale_feature_flag",
              "error_tracking",
              "event_tracking",
              "funnel",
            ],
          },
          file: {
            type: "string",
            description: "Relative file path where the issue lives",
          },
          lineHint: {
            type: "integer",
            description: "Approximate line number",
          },
        },
        required: ["id", "title", "description", "category"],
      },
      maxItems: 4,
    },
  },
  required: ["tasks"],
} as const;
