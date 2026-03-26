import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { Box, Flex, Text, TextField } from "@radix-ui/themes";
import { getLocalTimezone } from "../utils/schedule";

interface ScheduleStepProps {
  scheduleTime: string;
  onScheduleTimeChange: (time: string) => void;
  repoPath: string;
  onRepoPathChange: (path: string) => void;
  repository: string | null;
  onRepositoryChange: (repo: string | null) => void;
  onGithubIntegrationIdChange: (id: number | null) => void;
  selectedCount: number;
}

export function ScheduleStep({
  scheduleTime,
  onScheduleTimeChange,
  repoPath,
  onRepoPathChange,
  repository,
  onRepositoryChange,
  onGithubIntegrationIdChange,
  selectedCount,
}: ScheduleStepProps) {
  const { githubIntegration, repositories, isLoadingRepos } =
    useRepositoryIntegration();
  const timezone = getLocalTimezone();

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">
          Configure & create
        </Text>
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          Set a daily schedule and repo for all {selectedCount} automations.
        </Text>
      </Flex>

      <Flex gap="4" wrap="wrap">
        <Flex direction="column" gap="2">
          <Text size="1" weight="medium" className="font-mono text-[11px]">
            Daily time
          </Text>
          <TextField.Root
            type="time"
            value={scheduleTime}
            onChange={(e) => onScheduleTimeChange(e.target.value)}
          />
        </Flex>

        <Flex direction="column" gap="2">
          <Text size="1" weight="medium" className="font-mono text-[11px]">
            Timezone
          </Text>
          <Box className="rounded border border-gray-6 bg-gray-2 px-3 py-2">
            <Text size="1" className="font-mono text-[11px] text-gray-10">
              {timezone}
            </Text>
          </Box>
        </Flex>
      </Flex>

      <Flex direction="column" gap="2">
        <Text size="1" weight="medium" className="font-mono text-[11px]">
          Local context
        </Text>
        <FolderPicker
          value={repoPath}
          onChange={onRepoPathChange}
          placeholder="Select repository..."
          size="2"
        />
      </Flex>

      <Flex direction="column" gap="2">
        <Text size="1" weight="medium" className="font-mono text-[11px]">
          GitHub repository
        </Text>
        <GitHubRepoPicker
          value={repository}
          onChange={(repo) => {
            onRepositoryChange(repo);
            onGithubIntegrationIdChange(githubIntegration?.id ?? null);
          }}
          repositories={repositories}
          isLoading={isLoadingRepos}
          placeholder="Optional"
          size="2"
        />
      </Flex>

      <Box className="rounded-lg border border-gray-6 bg-gray-2 p-3">
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          Will create {selectedCount} automation
          {selectedCount === 1 ? "" : "s"}, running daily at {scheduleTime}{" "}
          {timezone}
        </Text>
      </Box>
    </Flex>
  );
}
