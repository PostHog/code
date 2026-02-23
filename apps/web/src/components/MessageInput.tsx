import { PaperPlaneRight, Stop } from "@phosphor-icons/react";
import { Box, Flex, IconButton } from "@radix-ui/themes";
import { useCallback, useState } from "react";

interface MessageInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  onCancel,
  isLoading,
  disabled,
  placeholder = "Send a follow-up message...",
}: MessageInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape" && isLoading && onCancel) {
        onCancel();
      }
    },
    [handleSubmit, isLoading, onCancel],
  );

  return (
    <Box className="border-gray-4 border-t">
      <Box className="mx-auto max-w-[750px] p-2">
        <Flex
          align="end"
          gap="2"
          className="rounded-lg border border-gray-6 bg-gray-2 px-3 py-2"
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className="max-h-[120px] min-h-[24px] flex-1 resize-none border-none bg-transparent font-mono text-[13px] text-gray-12 outline-none placeholder:text-gray-8"
            style={{ lineHeight: "1.5" }}
          />
          {isLoading ? (
            <IconButton size="1" variant="soft" color="red" onClick={onCancel}>
              <Stop size={14} weight="fill" />
            </IconButton>
          ) : (
            <IconButton
              size="1"
              variant="soft"
              disabled={!value.trim() || disabled}
              onClick={handleSubmit}
            >
              <PaperPlaneRight size={14} weight="fill" />
            </IconButton>
          )}
        </Flex>
      </Box>
    </Box>
  );
}
