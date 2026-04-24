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
  size?: "1" | "2";
}

export function ProjectSelect({
  projectId,
  projectName,
  projects,
  onProjectChange,
  disabled = false,
  size = "2",
}: ProjectSelectProps) {
  const [open, setOpen] = useState(false);
  const currentProject = projects.find((p) => p.id === projectId);
  const defaultValue = currentProject
    ? `${currentProject.name} ${currentProject.id}`
    : undefined;
  const [highlightedValue, setHighlightedValue] = useState(defaultValue);
  const sizeClass = size === "1" ? "text-[13px]" : "text-sm";

  if (projects.length <= 1) {
    return (
      <Text className={`text-(--gray-12) opacity-50 ${sizeClass}`}>
        {projectName}
      </Text>
    );
  }

  return (
    <Text className={sizeClass}>
      <span className="text-(--gray-12) opacity-50">
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
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "inherit",
              opacity: disabled ? 0.5 : 1,
            }}
            className="border-0 bg-transparent p-0 font-medium text-(--accent-9)"
          >
            change
          </button>
        </Popover.Trigger>
        <Popover.Content
          className="project-select-popover p-0"
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
                    <Text className="text-sm">{project.name}</Text>
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
