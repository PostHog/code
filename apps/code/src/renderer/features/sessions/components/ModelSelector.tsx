import type { SessionConfigSelectGroup } from "@agentclientprotocol/sdk";
import { Select, Text } from "@radix-ui/themes";
import { Fragment, useMemo } from "react";
import { getSessionService } from "../service/service";
import {
  flattenSelectOptions,
  useModelConfigOptionForTask,
  useSessionForTask,
} from "../stores/sessionStore";

interface ModelSelectorProps {
  taskId?: string;
  disabled?: boolean;
  onModelChange?: (modelId: string) => void;
  adapter?: "claude" | "codex";
}

export function ModelSelector({
  taskId,
  disabled,
  onModelChange,
  adapter: _adapter,
}: ModelSelectorProps) {
  const session = useSessionForTask(taskId);
  const modelOption = useModelConfigOptionForTask(taskId);

  const selectOption = modelOption?.type === "select" ? modelOption : undefined;
  const options = selectOption
    ? flattenSelectOptions(selectOption.options)
    : [];
  const groupedOptions = useMemo(() => {
    if (!selectOption || selectOption.options.length === 0) return [];
    if ("group" in selectOption.options[0]) {
      return selectOption.options as SessionConfigSelectGroup[];
    }
    return [];
  }, [selectOption]);

  if (!selectOption || options.length === 0) return null;

  const handleChange = (value: string) => {
    onModelChange?.(value);

    if (taskId && session?.status === "connected") {
      getSessionService().setSessionConfigOption(
        taskId,
        selectOption.id,
        value,
      );
    }
  };

  const currentValue = selectOption.currentValue;
  const currentLabel =
    options.find((opt) => opt.value === currentValue)?.name ?? currentValue;

  return (
    <Select.Root
      value={currentValue}
      onValueChange={handleChange}
      disabled={disabled}
      size="1"
    >
      <Select.Trigger
        variant="ghost"
        style={{
          fontSize: "12px",
          color: "var(--gray-11)",
          padding: "4px 8px",
          marginLeft: "4px",
          height: "auto",
          minHeight: "unset",
        }}
      >
        <Text style={{ fontSize: "12px" }}>{currentLabel}</Text>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {groupedOptions.length > 0
          ? groupedOptions.map((group, index) => (
              <Fragment key={group.group}>
                {index > 0 && <Select.Separator />}
                <Select.Group>
                  <Select.Label>{group.name}</Select.Label>
                  {group.options.map((model) => (
                    <Select.Item key={model.value} value={model.value}>
                      {model.name}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Fragment>
            ))
          : options.map((model) => (
              <Select.Item key={model.value} value={model.value}>
                {model.name}
              </Select.Item>
            ))}
      </Select.Content>
    </Select.Root>
  );
}
