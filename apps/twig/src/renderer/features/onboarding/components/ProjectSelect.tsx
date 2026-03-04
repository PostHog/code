import { Command } from "@features/command/components/Command";
import { Check } from "@phosphor-icons/react";
import { Flex, Popover, Text } from "@radix-ui/themes";
import { useState } from "react";
import "./ProjectSelect.css";

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
  const [open, setOpen] = useState(false);
  const currentProject = projects.find((p) => p.id === projectId);
  const defaultValue = currentProject
    ? `${currentProject.name} ${currentProject.id}`
    : undefined;
  const [highlightedValue, setHighlightedValue] = useState(defaultValue);

  if (projects.length <= 1) {
    return (
      <Text size="2" style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
        {projectName}
      </Text>
    );
  }

  return (
    <Text size="2">
      <span style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}>
        {projectName}
        {" · "}
      </span>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setHighlightedValue(defaultValue);
          }
        }}
      >
        <Popover.Trigger>
          <button
            type="button"
            disabled={disabled}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent-9)",
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontWeight: 500,
              fontSize: "inherit",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            change
          </button>
        </Popover.Trigger>
        <Popover.Content
          className="project-select-popover"
          style={{ padding: 0 }}
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <Command.Root
            shouldFilter={true}
            label="Project picker"
            value={highlightedValue}
            onValueChange={setHighlightedValue}
          >
            <Command.Input placeholder="Search projects..." autoFocus={true} />
            <Command.List>
              <Command.Empty>No projects found.</Command.Empty>
              {projects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={`${project.name} ${project.id}`}
                  onSelect={() => {
                    onProjectChange(project.id);
                    setOpen(false);
                  }}
                >
                  <Flex align="center" justify="between" width="100%">
                    <Text size="2">{project.name}</Text>
                    {project.id === projectId && (
                      <Check size={14} className="text-accent-11" />
                    )}
                  </Flex>
                </Command.Item>
              ))}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    </Text>
  );
}
