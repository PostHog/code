import type { Environment } from "@main/services/environment/schemas";
import type { RegisteredFolder } from "@main/services/folders/schemas";
import { Folder as FolderIcon, Plus } from "@phosphor-icons/react";
import { Flex, IconButton, Text } from "@radix-ui/themes";
import { EnvironmentRow } from "./EnvironmentRow";
import type { ProjectEnvironments } from "./EnvironmentsSettings";

function extractOrgName(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const sshMatch = remoteUrl.match(/:([^/]+)\//);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = remoteUrl.match(/\.com\/([^/]+)\//);
  if (httpsMatch) return httpsMatch[1];
  return null;
}

interface ProjectEnvironmentCardProps {
  project: ProjectEnvironments;
  onCreate: (folder: RegisteredFolder) => void;
  onEdit: (folder: RegisteredFolder, environment: Environment) => void;
}

export function ProjectEnvironmentCard({
  project,
  onCreate,
  onEdit,
}: ProjectEnvironmentCardProps) {
  const { folder, environments } = project;
  const orgName = extractOrgName(folder.remoteUrl);

  return (
    <Flex
      direction="column"
      style={{
        border: "1px solid var(--gray-5)",
        borderRadius: "var(--radius-2)",
      }}
    >
      <Flex align="center" justify="between" gap="2" px="3" py="2">
        <Flex align="center" gap="2" style={{ minWidth: 0, flex: 1 }}>
          <FolderIcon
            size={14}
            weight="regular"
            style={{ flexShrink: 0, color: "var(--gray-9)" }}
          />
          <Flex align="center" gap="2" style={{ minWidth: 0 }}>
            <Text size="1" weight="medium" truncate>
              {folder.name}
            </Text>
            {orgName && (
              <Text size="1" color="gray">
                {orgName}
              </Text>
            )}
          </Flex>
        </Flex>
        <IconButton
          variant="outline"
          color="gray"
          size="1"
          onClick={() => onCreate(folder)}
          title="Create environment"
        >
          <Plus size={12} />
        </IconButton>
      </Flex>

      {environments.length > 0 && (
        <Flex
          direction="column"
          px="3"
          style={{ borderTop: "1px solid var(--gray-4)" }}
        >
          {environments.map((env, index) => (
            <EnvironmentRow
              key={env.id}
              environment={env}
              isLast={index === environments.length - 1}
              onClick={() => onEdit(folder, env)}
            />
          ))}
        </Flex>
      )}
    </Flex>
  );
}
