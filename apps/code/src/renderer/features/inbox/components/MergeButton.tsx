import { DropdownMenu } from "@radix-ui/themes";

type MergeButtonSize = "sm" | "lg";
type MergeState = "default" | "merged" | "merged-behind-flag";

interface MergeButtonProps {
  size?: MergeButtonSize;
  state?: MergeState;
  onMerge?: () => void;
  onMergeBehindFlag?: () => void;
}

export function MergeButton({
  size = "lg",
  state = "default",
  onMerge,
  onMergeBehindFlag,
}: MergeButtonProps) {
  const isMerged = state !== "default";

  const sizeClasses =
    size === "lg"
      ? { label: "px-3.5 py-1.5 text-[13px]", caret: "px-2 py-1.5" }
      : { label: "px-2.5 py-1 text-[12px]", caret: "px-1.5 py-1" };

  const mergedBg = "bg-green-12";
  const defaultBg = "bg-green-9 hover:bg-green-10";

  const bgClass = isMerged ? mergedBg : defaultBg;
  const textClass = isMerged ? "text-green-3/70" : "text-white";

  const label =
    state === "merged"
      ? "\u2713 Merged"
      : state === "merged-behind-flag"
        ? "\u2713 Behind flag"
        : "Merge";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper for split-button
    <span
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Primary button */}
      <button
        type="button"
        disabled={isMerged}
        onClick={onMerge}
        className={`${sizeClasses.label} ${bgClass} ${textClass} rounded-l-md font-medium disabled:cursor-not-allowed`}
      >
        {label}
      </button>

      {/* Divider */}
      <div className={`w-px ${isMerged ? mergedBg : "bg-white/30"}`} />

      {/* Caret dropdown */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger disabled={isMerged}>
          <button
            type="button"
            disabled={isMerged}
            className={`${sizeClasses.caret} ${bgClass} ${textClass} rounded-r-md disabled:cursor-not-allowed`}
          >
            {"\u25BE"}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content align="end" style={{ minWidth: 200 }}>
          <DropdownMenu.Item onSelect={() => onMerge?.()}>
            <div className="flex flex-col">
              <span className="font-medium text-[13px]">Merge to main</span>
              <span className="text-(--gray-9) text-[11px]">Ship now</span>
            </div>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onMergeBehindFlag?.()}>
            <div className="flex flex-col">
              <span className="font-medium text-[13px]">Merge behind flag</span>
              <span className="text-(--gray-9) text-[11px]">
                Ship dark {"\u00B7"} 0% rollout
              </span>
            </div>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </span>
  );
}
