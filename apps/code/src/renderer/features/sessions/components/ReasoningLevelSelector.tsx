import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { Brain, CaretDown } from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  MenuLabel,
} from "@posthog/quill";
import type { RefObject } from "react";
import { flattenSelectOptions } from "../stores/sessionStore";

interface ReasoningLevelSelectorProps {
  thoughtOption?: SessionConfigOption;
  adapter?: "claude" | "codex";
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** See ModeSelectorProps.portalContainer. */
  portalContainer?: RefObject<HTMLElement | null>;
}

export function ReasoningLevelSelector({
  thoughtOption,
  adapter,
  onChange,
  disabled,
  portalContainer,
}: ReasoningLevelSelectorProps) {
  if (!thoughtOption || thoughtOption.type !== "select") {
    return null;
  }

  const options = flattenSelectOptions(thoughtOption.options);
  if (options.length === 0) return null;
  const activeLevel = thoughtOption.currentValue;
  const activeLabel =
    options.find((opt) => opt.value === activeLevel)?.name ?? activeLevel;
  const triggerLabel = `${adapter === "codex" ? "Reasoning" : "Effort"}: ${activeLabel}`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={disabled}
            aria-label={triggerLabel}
          >
            <Brain size={14} className="text-muted-foreground" />
            {triggerLabel}
            <CaretDown
              size={10}
              weight="bold"
              className="text-muted-foreground"
            />
          </Button>
        }
      />
      <DropdownMenuPortal container={portalContainer}>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={6}
          className="min-w-[180px]"
        >
          <MenuLabel>{adapter === "codex" ? "Reasoning" : "Effort"}</MenuLabel>
          <DropdownMenuRadioGroup
            value={activeLevel}
            onValueChange={(value) => onChange?.(value)}
          >
            {options.map((level) => (
              <DropdownMenuRadioItem key={level.value} value={level.value}>
                <span className="whitespace-nowrap">{level.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
