import type { InboxSort } from "@features/inbox/stores/inboxViewStore";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "@radix-ui/themes";

interface SortDropdownProps {
  sort: InboxSort;
  onSortChange: (sort: InboxSort) => void;
}

const SORT_OPTIONS: { value: InboxSort; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "recent", label: "Recent" },
];

export function SortDropdown({ sort, onSortChange }: SortDropdownProps) {
  const currentLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Recent";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-(--gray-11) text-[12px] hover:bg-(--gray-3) hover:text-(--gray-12)"
        >
          <span className="font-mono text-(--gray-9) text-[10px] uppercase tracking-wide">
            Sort
          </span>
          <span className="font-medium">{currentLabel}</span>
          <CaretDownIcon size={10} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" size="1" style={{ minWidth: 160 }}>
        {SORT_OPTIONS.map((option) => (
          <DropdownMenu.Item
            key={option.value}
            onSelect={() => onSortChange(option.value)}
          >
            <span className="w-[14px] shrink-0">
              {sort === option.value && <CheckIcon size={12} />}
            </span>
            {option.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
