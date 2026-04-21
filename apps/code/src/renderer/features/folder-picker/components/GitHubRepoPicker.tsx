import { Tooltip } from "@components/ui/Tooltip";
import { ArrowClockwise, GithubLogo } from "@phosphor-icons/react";
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
import { type RefObject, useEffect, useRef, useState } from "react";

const COMBOBOX_LIMIT = 50;

interface GitHubRepoPickerProps {
  value: string | null;
  onChange: (repo: string | null) => void;
  repositories: string[];
  isLoading: boolean;
  placeholder?: string;
  size?: "1" | "2";
  disabled?: boolean;
  anchor?: RefObject<HTMLElement | null>;
  /** When false, the list is shown without a filter field (e.g. short lists in modals). */
  showSearchInput?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
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
  onRefresh,
  isRefreshing = false,
}: GitHubRepoPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
      limit={COMBOBOX_LIMIT}
      value={value}
      onValueChange={(v) => {
        onChange(v ? (v as string) : null);
      }}
      inputValue={searchQuery}
      onInputValueChange={setSearchQuery}
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
          <div className="flex min-w-0 items-center gap-1 pe-2">
            <div className="min-w-0 flex-1">
              <ComboboxInput placeholder="Search repositories..." />
            </div>
            {onRefresh ? (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || isRefreshing}
                aria-label="Refresh repositories"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRefresh();
                }}
              >
                <ArrowClockwise
                  size={14}
                  className={isRefreshing ? "animate-spin" : undefined}
                />
              </Button>
            ) : null}
          </div>
        ) : null}
        <ComboboxEmpty>No repositories found.</ComboboxEmpty>
        <ComboboxList>
          {(repo: string) => (
            <ComboboxItem key={repo} value={repo}>
              {repo}
            </ComboboxItem>
          )}
        </ComboboxList>

        {repositories.length > COMBOBOX_LIMIT && (
          <div className="px-2 py-1.5 text-center text-muted-foreground text-xs">
            {searchQuery
              ? `Showing up to ${COMBOBOX_LIMIT} matches — refine your search`
              : `Showing ${COMBOBOX_LIMIT} of ${repositories.length} — type to filter`}
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
