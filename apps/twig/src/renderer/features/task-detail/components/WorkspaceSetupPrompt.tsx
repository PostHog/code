import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { foldersApi } from "@features/folders/hooks/useFolders";
import { useEnsureWorkspace } from "@features/workspace/hooks/useWorkspace";
import { Folder } from "@phosphor-icons/react";
import { Box, Code, Flex, Spinner, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { logger } from "@utils/logger";
import { getTaskRepository } from "@utils/repository";
import { toast } from "@utils/toast";
import { useCallback, useState } from "react";

const log = logger.scope("workspace-setup-prompt");

interface WorkspaceSetupPromptProps {
  taskId: string;
  task: Task;
}

export function WorkspaceSetupPrompt({
  taskId,
  task,
}: WorkspaceSetupPromptProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const repository = getTaskRepository(task);
  const { ensureWorkspace } = useEnsureWorkspace();

  const handleFolderSelect = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      setIsSettingUp(true);

      try {
        await foldersApi.addFolder(path);

        await ensureWorkspace(taskId, path, "worktree");

        log.info("Workspace setup complete", { taskId, path });
      } catch (error) {
        log.error("Failed to set up workspace", { error });
        toast.error("Failed to set up workspace. Please try again.");
      } finally {
        setSelectedPath("");
        setIsSettingUp(false);
      }
    },
    [taskId, ensureWorkspace],
  );

  return (
    <Flex
      align="center"
      justify="center"
      direction="column"
      gap="3"
      className="absolute inset-0"
    >
      {isSettingUp ? (
        <>
          <Spinner size="3" />
          <Text size="2" className="text-gray-11">
            Setting up workspace...
          </Text>
        </>
      ) : (
        <>
          <Folder size={32} weight="duotone" className="text-gray-9" />
          <Text size="3" weight="medium" className="text-gray-12">
            Select a repository folder
          </Text>
          {repository && (
            <Text size="2" className="text-gray-11">
              This task is linked to <Code>{repository}</Code>
            </Text>
          )}
          <Box mt="1">
            <FolderPicker
              value={selectedPath}
              onChange={handleFolderSelect}
              placeholder="Select folder..."
              size="2"
            />
          </Box>
        </>
      )}
    </Flex>
  );
}
