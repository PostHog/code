import { useSessionForTask } from "@features/sessions/hooks/useSession";
import { Eye } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";

interface CloudGitInteractionHeaderProps {
  taskId: string;
}

export function CloudGitInteractionHeader({
  taskId,
}: CloudGitInteractionHeaderProps) {
  const session = useSessionForTask(taskId);
  const prUrl = (session?.cloudOutput?.pr_url as string) ?? null;

  if (!prUrl) return null;

  return (
    <div className="no-drag">
      <Button size="1" variant="solid" asChild>
        <a href={prUrl} target="_blank" rel="noopener noreferrer">
          <Flex align="center" gap="2">
            <Eye size={12} weight="bold" />
            <Text size="1">View PR</Text>
          </Flex>
        </a>
      </Button>
    </div>
  );
}
