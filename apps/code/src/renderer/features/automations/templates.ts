import type { AutomationTemplate } from "@shared/types/automations";

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "check-metrics",
    name: "Check My Metrics",
    description:
      "Review key product metrics, flag unusual movement, and summarize what needs attention.",
    category: "Product",
    tags: ["metrics", "product", "summary"],
    prompt:
      "Review the most important product and growth metrics for this codebase and surrounding context. Summarize meaningful changes, highlight anything that looks off, and suggest the highest-leverage next actions.",
  },
  {
    id: "check-github-prs",
    name: "Check My GitHub PRs",
    description:
      "Look through recent pull requests and summarize what needs review or follow-up.",
    category: "Engineering",
    tags: ["github", "prs", "review"],
    prompt:
      "Check the current GitHub pull requests relevant to this repository and summarize what needs my attention. Call out stalled PRs, merge blockers, risky changes, and any follow-up actions I should take today.",
  },
  {
    id: "product-issues",
    name: "Summarize Product Issues",
    description:
      "Scan recent issue signals and produce a concise action-oriented update.",
    category: "Support",
    tags: ["issues", "triage", "summary"],
    prompt:
      "Review the recent product issues and signals associated with this repository. Group related problems, identify anything urgent, and recommend the best next actions for the team.",
  },
];
