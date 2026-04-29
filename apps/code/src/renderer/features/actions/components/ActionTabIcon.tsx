import { Tooltip } from "@components/ui/Tooltip";
import {
  getActionSessionId,
  useActionStore,
} from "@features/actions/stores/actionStore";
import { terminalManager } from "@features/terminal/services/TerminalManager";
import { ArrowClockwise, Check, X } from "@phosphor-icons/react";
import { Spinner } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import { useCallback, useState } from "react";

interface ActionTabIconProps {
  actionId: string;
}

export function ActionTabIcon({ actionId }: ActionTabIconProps) {
  const [hovered, setHovered] = useState(false);
  const status = useActionStore((state) => state.statuses[actionId]);
  const generation = useActionStore(
    (state) => state.generations[actionId] ?? 0,
  );
  const rerun = useActionStore((state) => state.rerun);

  const triggerRerun = useCallback(() => {
    const sessionId = getActionSessionId(actionId, generation);
    terminalManager.destroy(sessionId);
    trpcClient.shell.destroy.mutate({ sessionId });
    rerun(actionId);
  }, [actionId, generation, rerun]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hovered) return;
      e.stopPropagation();
      triggerRerun();
    },
    [hovered, triggerRerun],
  );

  let icon: React.ReactNode;
  if (hovered) {
    icon = <ArrowClockwise size={14} weight="bold" />;
  } else if (status === "success") {
    icon = <Check size={14} weight="bold" className="text-green-9" />;
  } else if (status === "error") {
    icon = <X size={14} weight="bold" className="text-red-9" />;
  } else {
    icon = <Spinner size="1" />;
  }

  const content = (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        cursor: hovered ? "pointer" : undefined,
        color: "inherit",
      }}
      className="m-0 flex items-center border-0 bg-transparent p-0"
    >
      {icon}
    </button>
  );

  if (hovered) {
    return (
      <Tooltip content="Rerun action" side="bottom">
        {content}
      </Tooltip>
    );
  }

  return content;
}
