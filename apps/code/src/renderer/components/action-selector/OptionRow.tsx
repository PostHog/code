import { Box, Checkbox, Flex, Radio, Text } from "@radix-ui/themes";
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
  isHovered: boolean;
  isChecked: boolean;
  showCheckbox: boolean;
  multiSelect: boolean;
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
  onMouseLeave: () => void;
}

export function OptionRow({
  option,
  index,
  isSelected,
  isHovered,
  isChecked,
  showCheckbox,
  multiSelect,
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
  onMouseLeave,
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
        onMouseLeave={onMouseLeave}
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
              : isHovered
                ? "var(--blue-4)"
                : "var(--blue-3)",
          display: "inline-flex",
          height: "28px",
        }}
      >
        <Text
          className={`font-medium text-[13px] leading-5 ${
            isSelected
              ? isCancel
                ? "text-gray-12"
                : "text-blue-12"
              : "text-gray-12"
          }`}
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
    const textClass = isSelected
      ? "text-blue-11"
      : isHovered
        ? "text-blue-11"
        : "text-gray-12";

    return (
      <Text
        className={`font-medium text-[13px] leading-5 ${textClass}`}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {displayText}
      </Text>
    );
  };

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      py="1"
      style={{
        cursor: "pointer",
        paddingTop: "4px",
        paddingBottom: "4px",
        userSelect: "none",
        borderRadius: "var(--radius-2)",
        background: isSelected
          ? "var(--blue-3)"
          : isHovered
            ? "var(--gray-a3)"
            : "transparent",
        marginLeft: "calc(var(--space-3) * -1)",
        marginRight: "calc(var(--space-3) * -1)",
        paddingLeft: "var(--space-3)",
        paddingRight: "var(--space-3)",
      }}
    >
      <Flex align="center" gap="2" className="leading-4">
        <Text
          className={`text-[13px] leading-4 ${isSelected ? "text-blue-11" : "text-gray-11"}`}
          style={{ width: "1ch", flexShrink: 0 }}
        >
          {isSelected ? "›" : ""}
        </Text>
        <Text
          className={`text-[13px] leading-4 ${
            isSelected
              ? "text-blue-11"
              : isHovered
                ? "text-blue-11"
                : "text-gray-11"
          }`}
          style={{
            minWidth: "16px",
            textAlign: "right",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {index + 1}.
        </Text>
        {showCheckbox &&
          (multiSelect ? (
            <Checkbox
              size="1"
              color="green"
              checked={isChecked}
              style={{ pointerEvents: "none", flexShrink: 0 }}
            />
          ) : (
            <Radio
              size="1"
              color="green"
              value={option.id}
              checked={isChecked}
              style={{ pointerEvents: "none", flexShrink: 0 }}
            />
          ))}
        <Box className="leading-4" style={{ flex: 1, minWidth: 0 }}>
          {renderLabel()}
        </Box>
      </Flex>
      {option.description && !isCurrentlyEditing && (
        <Text
          as="p"
          className="text-[13px] text-gray-11 leading-5"
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
