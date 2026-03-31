import { BRANCH_PREFIX } from "@shared/constants";

export function deriveBranchName(title: string, fallbackId: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

  if (!slug) return `${BRANCH_PREFIX}task-${fallbackId}`;
  return `${BRANCH_PREFIX}${slug}`;
}
