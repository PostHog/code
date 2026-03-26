import { Flex, Text, TextArea } from "@radix-ui/themes";

interface RoleStepProps {
  roleDescription: string;
  onRoleDescriptionChange: (value: string) => void;
}

export function RoleStep({
  roleDescription,
  onRoleDescriptionChange,
}: RoleStepProps) {
  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">
          Tell me about your role
        </Text>
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          ...and any specific things you'd like to automate (or just let me
          cook)
        </Text>
      </Flex>

      <TextArea
        value={roleDescription}
        onChange={(e) => onRoleDescriptionChange(e.target.value)}
        placeholder="e.g. I'm a founder building developer tools, focused on shipping fast and keeping on top of PRs, customer issues, and team updates"
        rows={5}
        autoFocus
      />

      <Text size="1" className="font-mono text-[11px] text-gray-10">
        Leave empty and click Next to see all available automations.
      </Text>
    </Flex>
  );
}
