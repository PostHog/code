import { GithubLogo } from "@phosphor-icons/react";
import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@posthog/quill";
import type { RefObject } from "react";

interface GitHubRepoPickerProps {
  value: string | null;
  onChange: (repo: string) => void;
  repositories: string[];
  isLoading: boolean;
  placeholder?: string;
  size?: "1" | "2";
  disabled?: boolean;
  anchor?: RefObject<HTMLElement | null>;
}

export function GitHubRepoPicker({
  value,
  onChange,
  repositories,
  isLoading,
  placeholder = "Select repository...",
  disabled = false,
  anchor,
}: GitHubRepoPickerProps) {
  if (isLoading) {
    return (
      <Button variant="outline" disabled size="sm">
        <GithubLogo size={16} weight="regular" style={{ flexShrink: 0 }} />
        Loading repos...
      </Button>
    );
  }

  if (repositories.length === 0) {
    return (
      <Button variant="outline" disabled size="sm">
        <GithubLogo size={16} weight="regular" style={{ flexShrink: 0 }} />
        No GitHub repos
      </Button>
    );
  }

  return (
    <Combobox
      items={repositories}
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as string);
      }}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Repository"
          >
            <GithubLogo size={14} weight="regular" className="shrink-0" />
            <span className="min-w-0 truncate">{value ?? placeholder}</span>
          </Button>
        }
      />
      <ComboboxContent
        anchor={anchor}
        side="bottom"
        sideOffset={6}
        className="min-w-[280px]"
      >
        <ComboboxInput placeholder="Search repositories..." />
        <ComboboxEmpty>No repositories found.</ComboboxEmpty>
        <ComboboxList>
          {(repo: string) => (
            <ComboboxItem key={repo} value={repo}>
              {repo}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
