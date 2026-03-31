interface InboxLiveRailProps {
  active: boolean;
}

/**
 * Thin “instrument” scan line while live polling is active — industrial / lab aesthetic.
 */
export function InboxLiveRail({ active }: InboxLiveRailProps) {
  if (!active) {
    return null;
  }

  return (
    <div
      className="relative mb-0 h-px w-full overflow-hidden"
      style={{ background: "var(--gray-5)" }}
      aria-hidden
    >
      <div
        className="absolute inset-y-0 w-[28%] opacity-95"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--amber-9), var(--orange-9), transparent)",
          animation:
            "inboxLiveRailSweep 2.1s cubic-bezier(0.45, 0, 0.55, 1) infinite",
        }}
      />
    </div>
  );
}
