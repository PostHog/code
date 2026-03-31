import { MagnifyingGlass } from "@phosphor-icons/react";
import { Spinner } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import type { MentionChip } from "../utils/content";

interface IssuePickerProps {
  repoPath: string;
  onSelect: (chip: MentionChip) => void;
}

export function IssuePicker({ repoPath, onSelect }: IssuePickerProps) {
  const trpc = useTRPC();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue]);

  const { data: issues = [], isLoading } = useQuery(
    trpc.git.searchGithubIssues.queryOptions(
      {
        directoryPath: repoPath,
        query: debouncedQuery || undefined,
        limit: 25,
      },
      { staleTime: 30_000 },
    ),
  );

  const handleSelect = (issue: (typeof issues)[number]) => {
    onSelect({
      type: "github_issue",
      id: issue.url,
      label: `#${issue.number} - ${issue.title}`,
    });
  };

  return (
    <Command shouldFilter={false} loop>
      <div className="combobox-input-wrapper">
        <MagnifyingGlass
          size={12}
          weight="regular"
          className="combobox-input-icon"
        />
        <Command.Input
          placeholder="Search issues..."
          value={inputValue}
          onValueChange={setInputValue}
          autoFocus
        />
      </div>

      <Command.List>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--space-4) 0",
            }}
          >
            <Spinner size="2" />
          </div>
        ) : issues.length === 0 ? (
          <Command.Empty>No issues found.</Command.Empty>
        ) : (
          <Command.Group>
            {issues.map((issue) => (
              <Command.Item
                key={issue.number}
                value={`${issue.number} ${issue.title}`}
                onSelect={() => handleSelect(issue)}
              >
                <div className="issue-picker-text">
                  <span className="issue-picker-title">
                    <span
                      className="issue-picker-dot"
                      style={{
                        background:
                          issue.state === "OPEN" ? "#238636" : "#AB7DF8",
                      }}
                    />
                    #{issue.number} - {issue.title}
                  </span>
                  <span className="issue-picker-meta">
                    {issue.repo}
                    {issue.labels.length > 0 && ` · ${issue.labels.join(", ")}`}
                  </span>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
