import { ActionSelector } from "@components/ActionSelector";
import { Box, Code } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import {
  type BasePermissionProps,
  findTextContent,
  toSelectorOptions,
} from "./types";

export function ExecutePermission({
  toolCall,
  options,
  onSelect,
  onCancel,
}: BasePermissionProps) {
  const command = findTextContent(toolCall.content);

  return (
    <ActionSelector
      title={toolCall.title ?? "Execute command"}
      pendingAction={
        command ? (
          <Box className="max-h-[30vh] overflow-auto">
            <Code
              variant="ghost"
              size="1"
              title={command}
              className="whitespace-pre-wrap break-all"
            >
              {compactHomePath(command)}
            </Code>
          </Box>
        ) : undefined
      }
      question="Do you want to proceed?"
      options={toSelectorOptions(options)}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );
}
