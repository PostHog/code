import { Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { isCancelOption, isOtherOption, isSubmitOption } from "./constants";
import { InlineEditableText } from "./InlineEditableText";
import type { SelectorOption } from "./types";

function needsCustomInput(option: SelectorOption): boolean {
  return option.customInput === true || isOtherOption(option.id);
}

function getPlaceholder(
  option: SelectorOption,
  customInputPlaceholder: string,
): string {
  if (option.customInput) {
    return "Type here to tell the agent what to do differently";
  }
  return customInputPlaceholder;
}

interface OptionRowProps {
  option: SelectorOption;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  showCheckbox: boolean;
  customInput: string;
  customInputPlaceholder: string;
  isEditing: boolean;
  submitLabel: string;
  onCustomInputChange: (value: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onEscape: () => void;
  onInlineSubmit: () => void;
  onClick: () => void;
  onMouseEnter: () => void;
}

export function OptionRow({
  option,
  index,
  isSelected,
  isChecked,
  showCheckbox,
  customInput,
  customInputPlaceholder,
  isEditing,
  submitLabel,
  onCustomInputChange,
  onNavigateUp,
  onNavigateDown,
  onEscape,
  onInlineSubmit,
  onClick,
  onMouseEnter,
}: OptionRowProps) {
  if (isSubmitOption(option.id) || isCancelOption(option.id)) {
    const isCancel = isCancelOption(option.id);
    return (
      <Flex
        align="center"
        justify="center"
        gap="2"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        px="2"
        style={{
          cursor: "pointer",
          borderRadius: "var(--radius-2)",
          background: isCancel
            ? isSelected
              ? "var(--gray-6)"
              : "var(--gray-3)"
            : isSelected
              ? "var(--blue-8)"
              : "var(--blue-3)",
          display: "inline-flex",
          height: "28px",
        }}
      >
        <Text
          size="1"
          weight="medium"
          className={
            isSelected
              ? isCancel
                ? "text-gray-12"
                : "text-blue-12"
              : "text-gray-12"
          }
        >
          {isCancel ? option.label : submitLabel}
        </Text>
      </Flex>
    );
  }

  const showsCustomInput = needsCustomInput(option);
  const isCurrentlyEditing = isEditing && isSelected;

  const renderLabel = () => {
    if (showsCustomInput) {
      return (
        <InlineEditableText
          value={customInput}
          placeholder={getPlaceholder(option, customInputPlaceholder)}
          active={isCurrentlyEditing}
          onChange={onCustomInputChange}
          onNavigateUp={onNavigateUp}
          onNavigateDown={onNavigateDown}
          onEscape={onEscape}
          onSubmit={onInlineSubmit}
        />
      );
    }

    const displayText = compactHomePath(option.label);
    const textClass = isSelected ? "text-blue-11" : "text-gray-12";

    return (
      <Text size="1" weight="medium" className={textClass}>
        {displayText}
      </Text>
    );
  };

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        cursor: "pointer",
        paddingTop: "4px",
        paddingBottom: "4px",
        userSelect: "none",
      }}
    >
      <Flex
        align="center"
        gap="2"
        style={{ lineHeight: "var(--line-height-1)" }}
      >
        <Text
          size="1"
          className={isSelected ? "text-blue-11" : "text-gray-11"}
          style={{ width: "1ch", flexShrink: 0 }}
        >
          {isSelected ? "›" : ""}
        </Text>
        <Text
          size="1"
          className={isSelected ? "text-blue-11" : "text-gray-11"}
          style={{
            minWidth: "16px",
            textAlign: "right",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {index + 1}.
        </Text>
        {showCheckbox && (
          <Checkbox
            size="1"
            color="green"
            checked={isChecked}
            style={{ pointerEvents: "none" }}
          />
        )}
        <Box style={{ flex: 1, minWidth: 0 }}>{renderLabel()}</Box>
      </Flex>
      {option.description && !isCurrentlyEditing && (
        <Text
          size="1"
          as="p"
          className="text-gray-11"
          style={{
            marginLeft: showCheckbox ? "64px" : "40px",
            marginTop: "2px",
          }}
        >
          {compactHomePath(option.description)}
        </Text>
      )}
    </Box>
  );
}
