import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@posthog/quill";
import type { GithubIssueState } from "../types";
import { githubIssueStateColor } from "../utils/githubIssueChip";

export interface IssueRowData {
  number: number;
  title: string;
  state: GithubIssueState;
  repo: string;
  labels: string[];
}

export function IssueRow({ issue }: { issue: IssueRowData }) {
  return (
    <Item size="xs" className="border-0 p-0">
      <ItemMedia variant="icon" className="mt-1 self-start">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: githubIssueStateColor(issue.state) }}
        />
      </ItemMedia>
      <ItemContent variant="menuItem">
        <ItemTitle className="whitespace-normal text-left">
          #{issue.number} - {issue.title}
        </ItemTitle>
        <ItemDescription className="text-left">
          {issue.repo}
          {issue.labels.length > 0 && ` · ${issue.labels.join(", ")}`}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
