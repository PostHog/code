export function InboxHeader() {
  return (
    <div className="shrink-0 pb-4">
      <h1 className="font-bold text-(--gray-12) text-2xl">Inbox</h1>
      <p className="mt-1 text-(--gray-11) text-[13px] leading-relaxed">
        The research agent watches errors, replays, support, and issues &mdash;
        and ships pull requests.{" "}
        <span className="font-semibold text-(--gray-12)">
          This is your inbox.
        </span>
      </p>
    </div>
  );
}
