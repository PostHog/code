import { useProjects } from "@features/posthog-projects/hooks/useProjects";
import { Select, Text } from "@radix-ui/themes";

export interface ProjectPickerProps {
  value: number | null;
  onChange: (projectId: number) => void;
  disabled?: boolean;
}

export function ProjectPicker({
  value,
  onChange,
  disabled,
}: ProjectPickerProps) {
  const { data: projects, isLoading, error } = useProjects();

  if (isLoading) {
    return (
      <Text color="gray" className="text-[13px]">
        Loading projects...
      </Text>
    );
  }

  if (error) {
    return (
      <Text color="red" className="text-[13px]">
        Failed to load projects: {error.message}
      </Text>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <Text color="gray" className="text-[13px]">
        No projects available in your current organization.
      </Text>
    );
  }

  return (
    <Select.Root
      value={value !== null ? String(value) : undefined}
      onValueChange={(v) => onChange(Number(v))}
      size="2"
      disabled={disabled}
    >
      <Select.Trigger
        placeholder="Select a project..."
        aria-label="PostHog project"
      />
      <Select.Content>
        {projects.map((project) => (
          <Select.Item key={project.id} value={String(project.id)}>
            {project.name ?? `Project ${project.id}`}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
