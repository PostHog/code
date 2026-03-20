import {
  type Environment,
  slugifyEnvironmentName,
} from "@main/services/environment/schemas";
import { Button, Flex, Text } from "@radix-ui/themes";

interface EnvironmentRowProps {
  environment: Environment;
  isLast: boolean;
  onClick: () => void;
}

export function EnvironmentRow({
  environment,
  isLast,
  onClick,
}: EnvironmentRowProps) {
  const filename = `${slugifyEnvironmentName(environment.name)}.toml`;

  return (
    <Flex
      align="center"
      justify="between"
      gap="2"
      py="2"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--gray-4)",
      }}
    >
      <Flex direction="column" style={{ minWidth: 0 }}>
        <Text size="1" truncate>
          {environment.name}
        </Text>
        <Text size="1" color="gray" truncate className="text-[11px]">
          {filename}
        </Text>
      </Flex>
      <Button
        variant="ghost"
        color="gray"
        size="1"
        onClick={onClick}
        style={{ flexShrink: 0 }}
      >
        View
      </Button>
    </Flex>
  );
}
