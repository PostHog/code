import { useCloudPrUrl } from "@features/git-interaction/hooks/useCloudPrUrl";
import { usePrActions } from "@features/git-interaction/hooks/usePrActions";
import { usePrDetails } from "@features/git-interaction/hooks/usePrDetails";
import {
  getPrVisualConfig,
  parsePrNumber,
} from "@features/git-interaction/utils/prStatus";
import { useSessionForTask } from "@features/sessions/hooks/useSession";
import { useSessionCallbacks } from "@features/sessions/hooks/useSessionCallbacks";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Spinner, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface CloudGitInteractionHeaderProps {
  taskId: string;
  task: Task;
}

export function CloudGitInteractionHeader({
  taskId,
  task,
}: CloudGitInteractionHeaderProps) {
  const prUrl = useCloudPrUrl(taskId);
  const session = useSessionForTask(taskId);
  const {
    meta: { state, merged, draft },
  } = usePrDetails(prUrl);
  const { execute, isPending } = usePrActions(prUrl);
  const { handleContinueLocally } = useSessionCallbacks({
    taskId,
    task,
    session: session ?? undefined,
    repoPath: null,
  });

  const config =
    prUrl && state !== null ? getPrVisualConfig(state, merged, draft) : null;
  const prNumber = prUrl ? parsePrNumber(prUrl) : null;
  const hasDropdown = config ? config.actions.length > 0 : false;

  return (
    <Flex align="center" gap="2" className="no-drag">
      <Button
        size="1"
        variant="soft"
        disabled={session?.handoffInProgress}
        onClick={handleContinueLocally}
      >
        <Text size="1">
          {session?.handoffInProgress ? "Transferring..." : "Continue locally"}
        </Text>
      </Button>
      {config && (
        <Flex align="center" gap="0">
          <Button
            size="1"
            variant="soft"
            color={config.color}
            asChild
            style={
              hasDropdown
                ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
                : undefined
            }
          >
            <a href={prUrl ?? ""} target="_blank" rel="noopener noreferrer">
              <Flex align="center" gap="2">
                {isPending ? <Spinner size="1" /> : config.icon}
                <Text size="1">
                  {config.label}
                  {prNumber && ` #${prNumber}`}
                </Text>
              </Flex>
            </a>
          </Button>
          {hasDropdown && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button
                  size="1"
                  variant="soft"
                  color={config.color}
                  disabled={isPending}
                  style={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderLeft: `1px solid var(--${config.color}-6)`,
                    paddingLeft: "6px",
                    paddingRight: "6px",
                  }}
                >
                  <ChevronDownIcon />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content size="1" align="end">
                {config.actions.map((action) => (
                  <DropdownMenu.Item
                    key={action.id}
                    onSelect={() => execute(action.id)}
                  >
                    <Text size="1">{action.label}</Text>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
        </Flex>
      )}
    </Flex>
  );
}
