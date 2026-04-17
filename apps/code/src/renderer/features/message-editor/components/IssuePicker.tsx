import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@posthog/quill";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { MentionChip } from "../utils/content";

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
  state: string;
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

  const { data: issues = [] } = useQuery(
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
    onSelect({
      type: "github_issue",
      id: value.url,
      label: `#${value.number} - ${value.title}`,
    });
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
        <ComboboxEmpty>No issues found.</ComboboxEmpty>
        <ComboboxList>
          {(issue: Issue) => (
            <ComboboxItem
              key={issue.number}
              value={issue}
              className="relative h-auto"
            >
              <Item size="xs" className="border-0 p-0">
                <ItemMedia variant="icon" className="mt-1 self-start">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      background:
                        issue.state === "OPEN" ? "#238636" : "#AB7DF8",
                    }}
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
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
