import { Flex, Select, Text } from "@radix-ui/themes";
import { useState } from "react";

interface ProjectSelectProps {
  projectId: number;
  projectName: string;
  projects: Array<{ id: number; name: string }>;
  onProjectChange: (projectId: number) => void;
  disabled?: boolean;
}

export function ProjectSelect({
  projectId,
  projectName,
  projects,
  onProjectChange,
  disabled = false,
}: ProjectSelectProps) {
  const [expanded, setExpanded] = useState(false);

  // Don't show anything if there's only one project
  if (projects.length <= 1) {
    return null;
  }

  if (!expanded) {
    return (
      <Text size="2">
        <span style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
          {projectName}
          {" · "}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent-9)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "inherit",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          change
        </button>
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2" style={{ width: "100%" }}>
      <Flex justify="between" align="center">
        <Text
          size="2"
          weight="medium"
          style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
        >
          PostHog project
        </Text>
        <Text size="2" style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent-9)",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "inherit",
            }}
          >
            cancel
          </button>
        </Text>
      </Flex>
      <Select.Root
        value={projectId.toString()}
        onValueChange={(value) => {
          onProjectChange(Number(value));
          setExpanded(false);
        }}
        size="2"
        disabled={disabled}
      >
        <Select.Trigger />
        <Select.Content>
          {projects.map((project) => (
            <Select.Item key={project.id} value={project.id.toString()}>
              {project.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}
