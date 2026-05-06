import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { openUrlInBrowser } from "@features/integrations/hooks/useGithubUserConnect";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { getPostHogUrl } from "@utils/urls";

export function SlackSettings() {
  const projectId = useAuthStateValue((s) => s.projectId);
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);

  const slackSettingsUrl = projectId
    ? getPostHogUrl(
        `/project/${projectId}/settings/project-posthog-code#integration-posthog-code-slack`,
        cloudRegion,
      )
    : null;

  return (
    <Flex direction="column" gap="3">
      <Text className="text-(--gray-11) text-[13px]">
        Connect Slack to PostHog Code to kick off tasks like pull requests
        directly from Slack.
      </Text>
      <Flex>
        <Button
          size="1"
          disabled={!slackSettingsUrl}
          onClick={() => {
            if (slackSettingsUrl) void openUrlInBrowser(slackSettingsUrl);
          }}
        >
          <ArrowSquareOutIcon size={12} />
          Manage in PostHog Web
        </Button>
      </Flex>
    </Flex>
  );
}
