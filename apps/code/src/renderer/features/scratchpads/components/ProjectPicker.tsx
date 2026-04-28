import { useProjects } from "@features/projects/hooks/useProjects";
import { Select, Text } from "@radix-ui/themes";

export interface ProjectPickerProps {
  value: number | null;
  onChange: (projectId: number) => void;
  disabled?: boolean;
}

/**
 * Reuses the same data source as the sidebar's "Change project" dialog
 * (`@features/projects/hooks/useProjects`) so the project list stays in
 * sync with the auth state's `availableProjectIds` and the cached current
 * user's `organization.teams`.
 */
export function ProjectPicker({
  value,
  onChange,
  disabled,
}: ProjectPickerProps) {
  const { groupedProjects, isLoading, error } = useProjects();

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

  const hasProjects = groupedProjects.some((g) => g.projects.length > 0);
  if (!hasProjects) {
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
        {groupedProjects.map((group) => (
          <Select.Group key={group.orgId}>
            {groupedProjects.length > 1 && (
              <Select.Label>{group.orgName}</Select.Label>
            )}
            {group.projects.map((project) => (
              <Select.Item key={project.id} value={String(project.id)}>
                {project.name}
              </Select.Item>
            ))}
          </Select.Group>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
