import { Check, Copy } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { Tooltip } from "@renderer/components/ui/Tooltip";
import { trpcReact } from "@renderer/trpc";
import { useCallback, useState } from "react";

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [command]);

  return (
    <Flex
      align="center"
      gap="2"
      className="rounded border border-gray-6 bg-gray-2 px-2 py-1"
    >
      <Text size="1" className="font-mono text-gray-11">
        {command}
      </Text>
      <Tooltip content={copied ? "Copied!" : "Copy"}>
        <IconButton
          variant="ghost"
          size="1"
          color={copied ? "green" : "gray"}
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </IconButton>
      </Tooltip>
    </Flex>
  );
}

function PermissionBadge({
  permission,
  color,
}: {
  permission: string;
  color: "green" | "red";
}) {
  const bgClass = color === "green" ? "bg-green-500/20" : "bg-red-500/20";
  const textClass = color === "green" ? "text-green-400" : "text-red-400";
  const borderClass =
    color === "green" ? "border-green-500/30" : "border-red-500/30";

  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] leading-tight ${bgClass} ${textClass} ${borderClass}`}
    >
      {permission}
    </span>
  );
}

function PermissionList({
  title,
  permissions,
  color,
  emptyMessage,
}: {
  title: string;
  permissions: string[];
  color: "green" | "red";
  emptyMessage: string;
}) {
  return (
    <Box className="rounded-lg border border-gray-6 bg-gray-2 p-3">
      <Text size="1" weight="medium" className="mb-2 block">
        {title}
      </Text>
      <Box className="min-h-[40px] rounded border border-gray-5 bg-gray-3 p-2.5">
        {permissions.length > 0 ? (
          <Flex wrap="wrap" gap="2">
            {permissions.map((perm) => (
              <PermissionBadge key={perm} permission={perm} color={color} />
            ))}
          </Flex>
        ) : (
          <Text size="1" color="gray">
            {emptyMessage}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export function PermissionsSettings() {
  const { data } = trpcReact.os.getClaudePermissions.useQuery();

  return (
    <Flex direction="column" gap="3" mb="2">
      <PermissionList
        title="Allowed"
        permissions={data?.allow ?? []}
        color="green"
        emptyMessage="No allowed permissions configured"
      />

      <PermissionList
        title="Denied"
        permissions={data?.deny ?? []}
        color="red"
        emptyMessage="No denied permissions configured"
      />

      <Flex align="center" gap="2">
        <Text size="1" color="gray">
          Modify permissions with
        </Text>
        <CopyableCommand command="claude config" />
      </Flex>
    </Flex>
  );
}
