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
import type { MentionChip } from "../utils/content";

interface IssuePickerProps {
  repoPath: string;
  /** Controlled open state — AttachmentMenu toggles this after "Add issue" click. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chip: MentionChip) => void;
  /** DOM anchor the combobox popup positions against (usually the paperclip button). */
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

  // Reset search when the popover closes.
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
      // Server-side filter — disable base-ui's client-side matching.
      filter={null}
    >
      <ComboboxContent
        anchor={anchor}
        side="top"
        align="start"
        sideOffset={6}
        className="flex min-w-[360px] flex-col gap-0 p-0"
      >
        <ComboboxInput
          autoFocus
          placeholder="Search issues..."
          className="rounded-none border-0 border-border/50 border-b shadow-none"
        />
        <ComboboxEmpty>No issues found.</ComboboxEmpty>
        <ComboboxList>
          {(issue: Issue) => (
            <ComboboxItem key={issue.number} value={issue}>
              <span className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        issue.state === "OPEN" ? "#238636" : "#AB7DF8",
                    }}
                  />
                  <span className="truncate">
                    #{issue.number} - {issue.title}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {issue.repo}
                  {issue.labels.length > 0 && ` · ${issue.labels.join(", ")}`}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
