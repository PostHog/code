import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@posthog/quill";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { GithubIssueState } from "../types";
import type { MentionChip } from "../utils/content";
import { githubIssueToMentionChip } from "../utils/githubIssueChip";
import { IssueRow } from "./IssueRow";

interface IssuePickerProps {
  repoPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chip: MentionChip) => void;
  anchor: React.RefObject<HTMLElement | null>;
}

type Issue = {
  number: number;
  title: string;
  url: string;
  repo: string;
  state: GithubIssueState;
  labels: string[];
};

export function IssuePicker({
  repoPath,
  open,
  onOpenChange,
  onSelect,
  anchor,
}: IssuePickerProps) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data: issues = [], isFetching } = useQuery(
    trpc.git.searchGithubIssues.queryOptions(
      {
        directoryPath: repoPath,
        query: debouncedQuery || undefined,
        limit: 25,
      },
      { staleTime: 30_000, enabled: open && !!repoPath },
    ),
  );

  const handleValueChange = (value: Issue | null) => {
    if (!value) return;
    onSelect(githubIssueToMentionChip(value));
  };

  return (
    <Combobox<Issue>
      items={issues as Issue[]}
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
      inputValue={query}
      onInputValueChange={(value) => setQuery(value ?? "")}
      onValueChange={(value) => handleValueChange(value as Issue | null)}
      filter={null}
    >
      <ComboboxContent
        anchor={anchor}
        side="top"
        align="start"
        sideOffset={6}
        className="min-w-[400px] p-0"
      >
        <ComboboxInput
          autoFocus
          showTrigger={false}
          placeholder="Search issues..."
        />
        <ComboboxEmpty>
          {isFetching ? "Searching..." : "No issues found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(issue: Issue) => (
            <ComboboxItem
              key={issue.number}
              value={issue}
              className="relative h-auto"
            >
              <IssueRow issue={issue} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
