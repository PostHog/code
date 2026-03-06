import { Combobox } from "@components/ui/combobox/Combobox";
import { GithubLogo } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";

interface GitHubRepoPickerProps {
  value: string | null;
  onChange: (repo: string) => void;
  repositories: string[];
  isLoading: boolean;
  placeholder?: string;
  size?: "1" | "2";
  disabled?: boolean;
}

export function GitHubRepoPicker({
  value,
  onChange,
  repositories,
  isLoading,
  placeholder = "Select repository...",
  size = "1",
  disabled = false,
}: GitHubRepoPickerProps) {
  if (isLoading) {
    return (
      <Button color="gray" variant="outline" size={size} disabled>
        <Flex align="center" gap="2">
          <GithubLogo size={16} weight="regular" style={{ flexShrink: 0 }} />
          <Text size={size}>Loading repos...</Text>
        </Flex>
      </Button>
    );
  }

  if (repositories.length === 0) {
    return (
      <Button color="gray" variant="outline" size={size} disabled>
        <Flex align="center" gap="2">
          <GithubLogo size={16} weight="regular" style={{ flexShrink: 0 }} />
          <Text size={size}>No GitHub repos</Text>
        </Flex>
      </Button>
    );
  }

  return (
    <Combobox.Root
      value={value ?? ""}
      onValueChange={onChange}
      size={size}
      disabled={disabled}
    >
      <Combobox.Trigger variant="outline" placeholder={placeholder}>
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <GithubLogo size={16} weight="regular" style={{ flexShrink: 0 }} />
          <Text size={size} truncate>
            {value
              ? value.includes("/")
                ? value.split("/").pop()
                : value
              : placeholder}
          </Text>
        </Flex>
      </Combobox.Trigger>
      <Combobox.Content style={{ maxHeight: "300px" }}>
        <Combobox.Input placeholder="Search repositories..." />
        <Combobox.Empty>No repositories found.</Combobox.Empty>
        {repositories.map((repo) => (
          <Combobox.Item key={repo} value={repo} textValue={repo}>
            {repo}
          </Combobox.Item>
        ))}
      </Combobox.Content>
    </Combobox.Root>
  );
}
