import type { InboxScope } from "@features/inbox/stores/inboxViewStore";

interface ScopeToggleProps {
  scope: InboxScope;
  forYouCount: number;
  allCount: number;
  onScopeChange: (scope: InboxScope) => void;
}

function ScopeCount({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`ml-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none ${
        active
          ? "bg-(--gray-5) text-(--gray-12)"
          : "bg-(--gray-4) text-(--gray-10)"
      }`}
    >
      {count}
    </span>
  );
}

export function ScopeToggle({
  scope,
  forYouCount,
  allCount,
  onScopeChange,
}: ScopeToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-(--gray-5) p-0.5">
      <button
        type="button"
        onClick={() => onScopeChange("for-you")}
        className={`flex items-center rounded px-2 py-0.5 font-medium text-[12px] transition-none ${
          scope === "for-you"
            ? "bg-(--gray-3) text-(--gray-12)"
            : "text-(--gray-10) hover:text-(--gray-12)"
        }`}
      >
        For you
        <ScopeCount count={forYouCount} active={scope === "for-you"} />
      </button>
      <button
        type="button"
        onClick={() => onScopeChange("all")}
        className={`flex items-center rounded px-2 py-0.5 font-medium text-[12px] transition-none ${
          scope === "all"
            ? "bg-(--gray-3) text-(--gray-12)"
            : "text-(--gray-10) hover:text-(--gray-12)"
        }`}
      >
        All of posthog
        <ScopeCount count={allCount} active={scope === "all"} />
      </button>
    </div>
  );
}
