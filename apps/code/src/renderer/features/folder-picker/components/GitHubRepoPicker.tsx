import { Tooltip } from "@components/ui/Tooltip";
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
import { type RefObject, useEffect, useRef } from "react";

interface GitHubRepoPickerProps {
  value: string | null;
  onChange: (repo: string) => void;
  repositories: string[];
  isLoading: boolean;
  placeholder?: string;
  size?: "1" | "2";
  disabled?: boolean;
  anchor?: RefObject<HTMLElement | null>;
  /** When false, the list is shown without a filter field (e.g. short lists in modals). */
  showSearchInput?: boolean;
}

export function GitHubRepoPicker({
  value,
  onChange,
  repositories,
  isLoading,
  placeholder = "Select repository...",
  disabled = false,
  anchor,
  showSearchInput = true,
}: GitHubRepoPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onlyRepo = repositories.length === 1 ? repositories[0] : null;

  useEffect(() => {
    if (onlyRepo && value !== onlyRepo) {
      onChange(onlyRepo);
    }
  }, [onlyRepo, value, onChange]);

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

  if (onlyRepo) {
    return (
      <Tooltip content="Only one GitHub repository is connected, so there's nothing to pick.">
        <span className="inline-flex min-w-0 max-w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            aria-label="Repository"
            className="pointer-events-none min-w-0 max-w-full cursor-default justify-start disabled:opacity-100"
          >
            <GithubLogo size={14} weight="regular" className="shrink-0" />
            <span className="min-w-0 truncate">{onlyRepo}</span>
          </Button>
        </span>
      </Tooltip>
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
            ref={triggerRef}
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
        anchor={anchor ?? triggerRef}
        side="bottom"
        sideOffset={6}
        className="min-w-[280px]"
      >
        {showSearchInput ? (
          <ComboboxInput placeholder="Search repositories..." />
        ) : null}
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
