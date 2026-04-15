import { Rocket } from "@phosphor-icons/react";

interface SetupItemProps {
  isActive: boolean;
  onClick: () => void;
}

export function SetupItem({ isActive, onClick }: SetupItemProps) {
  return (
    <button
      type="button"
      className="focus-visible:-outline-offset-2 flex w-full cursor-pointer items-start rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-8"
      data-active={isActive || undefined}
      style={{
        gap: "4px",
        paddingLeft: "8px",
        backgroundColor: isActive ? "var(--green-4)" : "var(--green-a3)",
        color: "var(--green-11)",
      }}
      onClick={onClick}
    >
      <span
        className="flex shrink-0 items-center"
        style={{
          height: "18px",
          width: "18px",
          justifyContent: "center",
          color: "var(--green-11)",
        }}
      >
        <Rocket size={16} weight={isActive ? "fill" : "duotone"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="flex items-center gap-1" style={{ height: "18px" }}>
          <span
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium"
            style={{ color: "var(--green-11)" }}
          >
            Finish setup
          </span>
        </span>
      </span>
    </button>
  );
}
