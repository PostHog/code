import type { GithubIssueState } from "../types";
import type { MentionChip } from "./content";

export interface GithubIssueChipSource {
  number: number;
  title: string;
  url: string;
}

export function githubIssueToMentionChip(
  issue: GithubIssueChipSource,
): MentionChip {
  return {
    type: "github_issue",
    id: issue.url,
    label: `#${issue.number} - ${issue.title}`,
  };
}

export const GITHUB_ISSUE_STATE_COLORS: Record<GithubIssueState, string> = {
  OPEN: "#238636",
  CLOSED: "#AB7DF8",
};

export function githubIssueStateColor(state: GithubIssueState): string {
  return GITHUB_ISSUE_STATE_COLORS[state];
}
