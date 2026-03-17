import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import {
  MagnifyingGlassIcon,
  PlugIcon,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Badge,
  Button,
  Dialog,
  Flex,
  IconButton,
  Select,
  Spinner,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import type {
  McpRecommendedServer,
  McpServerInstallation,
} from "@renderer/api/posthogClient";
import { trpcClient } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMcpServers } from "../../hooks/useMcpServers";

function AddCustomServerDialog({
  open,
  onOpenChange,
  onInstalled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [authType, setAuthType] = useState<"api_key" | "oauth">("oauth");
  const [apiKey, setApiKey] = useState("");

  const installMutation = useAuthenticatedMutation(
    async (
      client,
      vars: {
        name: string;
        url: string;
        description: string;
        auth_type: "api_key" | "oauth";
        api_key?: string;
      },
    ) => {
      // For OAuth, use the main process flow (handles deep links / HTTP callback)
      if (vars.auth_type === "oauth") {
        const { callbackUrl } =
          await trpcClient.mcpCallback.getCallbackUrl.query();
        const data = await client.installCustomMcpServer({
          ...vars,
          install_source: "posthog-code",
          posthog_code_callback_url: callbackUrl,
        });
        if ("redirect_url" in data && data.redirect_url) {
          return trpcClient.mcpCallback.openAndWaitForCallback.mutate({
            redirectUrl: data.redirect_url,
          });
        }
        return data;
      }
      return client.installCustomMcpServer(vars);
    },
    {
      onSuccess: (data) => {
        if (data && "success" in data && data.success) {
          toast.success("Server added");
        } else if (!("success" in data)) {
          toast.success("Server added");
        }
        onInstalled();
        resetAndClose();
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to add server");
      },
    },
  );

  const resetAndClose = useCallback(() => {
    setName("");
    setUrl("");
    setDescription("");
    setAuthType("oauth");
    setApiKey("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback(() => {
    installMutation.mutate({
      name,
      url,
      description,
      auth_type: authType,
      ...(authType === "api_key" && apiKey ? { api_key: apiKey } : {}),
    });
  }, [name, url, description, authType, apiKey, installMutation]);

  const canSubmit = name.trim() !== "" && url.trim() !== "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>Add custom MCP server</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Connect a custom MCP server to extend your AI agent&apos;s
          capabilities.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Name
            </Text>
            <TextField.Root
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My MCP server"
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              URL
            </Text>
            <TextField.Root
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Description
            </Text>
            <TextField.Root
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this server do?"
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Auth type
            </Text>
            <Select.Root
              value={authType}
              onValueChange={(val) => {
                setAuthType(val as "api_key" | "oauth");
                if (val !== "api_key") {
                  setApiKey("");
                }
              }}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="api_key">API key</Select.Item>
                <Select.Item value="oauth">OAuth</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          {authType === "api_key" && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">
                API key
              </Text>
              <TextField.Root
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
                type="password"
              />
            </Flex>
          )}
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || installMutation.isPending}
          >
            {installMutation.isPending ? <Spinner size="1" /> : null}
            Add server
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function UninstallConfirmDialog({
  serverName,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>Uninstall MCP server</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Are you sure you want to uninstall{" "}
          <Text weight="bold">{serverName}</Text>? This will remove the server
          and its configuration.
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button
              variant="solid"
              color="red"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? <Spinner size="1" /> : null}
              Uninstall
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

function ServerRow({
  name,
  description,
  status,
  isEnabled,
  onToggle,
  onUninstall,
}: {
  name: string;
  description?: string;
  status: "active" | "pending_oauth" | "needs_reauth";
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
}) {
  return (
    <Flex
      align="center"
      justify="between"
      py="3"
      px="3"
      className="rounded border border-gray-5 bg-gray-2"
    >
      <Flex align="center" gap="3" style={{ minWidth: 0, flex: 1 }}>
        <Flex
          align="center"
          justify="center"
          className="size-8 shrink-0 rounded bg-gray-4"
        >
          <PlugIcon size={16} className="text-gray-10" />
        </Flex>
        <Flex direction="column" gap="0" style={{ minWidth: 0 }}>
          <Text size="2" weight="medium" truncate>
            {name}
          </Text>
          {description && (
            <Text size="1" color="gray">
              {description}
            </Text>
          )}
        </Flex>
      </Flex>

      <Flex align="center" gap="2" className="shrink-0">
        {status === "active" && (
          <Switch size="1" checked={isEnabled} onCheckedChange={onToggle} />
        )}
        {status === "pending_oauth" && (
          <Badge color="amber" variant="soft" size="1">
            Pending
          </Badge>
        )}
        {status === "needs_reauth" && (
          <Badge color="red" variant="soft" size="1">
            Reconnect
          </Badge>
        )}
        <IconButton variant="ghost" color="gray" size="1" onClick={onUninstall}>
          <Trash size={14} />
        </IconButton>
      </Flex>
    </Flex>
  );
}

function RecommendedServerRow({
  server,
  onInstall,
  isInstalling,
}: {
  server: McpRecommendedServer;
  onInstall: () => void;
  isInstalling: boolean;
}) {
  return (
    <Flex
      align="center"
      justify="between"
      py="3"
      px="3"
      className="rounded border border-gray-5 bg-gray-2"
    >
      <Flex align="center" gap="3">
        <Flex
          align="center"
          justify="center"
          className="size-8 shrink-0 rounded bg-gray-4"
        >
          <PlugIcon size={16} className="text-gray-10" />
        </Flex>
        <Flex direction="column" gap="0" style={{ minWidth: 0 }}>
          <Text size="2" weight="medium" truncate>
            {server.name}
          </Text>
          {server.description && (
            <Text size="1" color="gray">
              {server.description}
            </Text>
          )}
        </Flex>
      </Flex>

      <Flex align="center" className="shrink-0">
        <Button
          variant="soft"
          size="1"
          onClick={onInstall}
          disabled={isInstalling}
        >
          {isInstalling ? <Spinner size="1" /> : null}
          Connect
        </Button>
      </Flex>
    </Flex>
  );
}

function getInstallationStatus(
  installation: McpServerInstallation,
): "active" | "pending_oauth" | "needs_reauth" {
  if (installation.pending_oauth) return "pending_oauth";
  if (installation.needs_reauth) return "needs_reauth";
  return "active";
}

export function McpServersSettings() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] =
    useState<McpServerInstallation | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const {
    installations,
    installationsLoading,
    servers,
    serversLoading,
    installedUrls,
    installingUrl,
    uninstallMutation,
    toggleEnabled,
    installRecommended,
    invalidateInstallations,
  } = useMcpServers();

  useEffect(() => {
    const refreshMcpState = () => {
      queryClient.invalidateQueries({ queryKey: ["mcp"] });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshMcpState();
      }
    };

    window.addEventListener("focus", refreshMcpState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshMcpState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);

  const filteredServers = useMemo(() => {
    if (!servers) return [];
    const available = servers.filter((s) => !installedUrls.has(s.url));
    if (!searchTerm) return available;
    const term = searchTerm.toLowerCase();
    return available.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term),
    );
  }, [servers, searchTerm, installedUrls]);

  const handleUninstall = useCallback(() => {
    if (uninstallTarget) {
      uninstallMutation.mutate(uninstallTarget.id, {
        onSuccess: () => setUninstallTarget(null),
      });
    }
  }, [uninstallTarget, uninstallMutation]);

  return (
    <Flex direction="column" gap="4" style={{ minWidth: 0 }}>
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">
          Manage MCP servers for your AI agents. Connect external services to
          extend your agent&apos;s capabilities.
        </Text>
      </Flex>

      {/* Installed servers */}
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between">
          <Text size="2" weight="medium">
            Installed servers
          </Text>
          <Button
            variant="soft"
            size="1"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus size={14} />
            Add custom server
          </Button>
        </Flex>

        {installationsLoading ? (
          <Flex align="center" justify="center" py="6">
            <Spinner size="2" />
          </Flex>
        ) : !installations || installations.length === 0 ? (
          <Flex
            align="center"
            justify="center"
            py="6"
            className="rounded border border-gray-6 border-dashed"
          >
            <Text size="2" color="gray">
              No servers installed yet. Browse recommended servers below or add
              a custom one.
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            {installations.map((installation) => (
              <ServerRow
                key={installation.id}
                name={installation.name || installation.display_name || ""}
                description={installation.description}
                status={getInstallationStatus(installation)}
                isEnabled={installation.is_enabled !== false}
                onToggle={(enabled) => toggleEnabled(installation.id, enabled)}
                onUninstall={() => setUninstallTarget(installation)}
              />
            ))}
          </Flex>
        )}
      </Flex>

      {/* Recommended servers */}
      {(servers ?? []).length > 0 && (
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between">
            <Text size="2" weight="medium">
              Pre-configured servers
            </Text>
          </Flex>

          <TextField.Root
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search servers..."
            size="2"
          >
            <TextField.Slot>
              <MagnifyingGlassIcon size={14} />
            </TextField.Slot>
            {searchTerm && (
              <TextField.Slot>
                <IconButton
                  variant="ghost"
                  size="1"
                  onClick={() => setSearchTerm("")}
                >
                  <X size={12} />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>

          {serversLoading ? (
            <Flex align="center" justify="center" py="6">
              <Spinner size="2" />
            </Flex>
          ) : (
            <Flex direction="column" gap="2">
              {filteredServers.map((server) => (
                <RecommendedServerRow
                  key={server.url}
                  server={server}
                  onInstall={() => installRecommended(server)}
                  isInstalling={installingUrl === server.url}
                />
              ))}
              {filteredServers.length === 0 && searchTerm && (
                <Flex align="center" justify="center" py="4">
                  <Text size="2" color="gray">
                    No servers match your search.
                  </Text>
                </Flex>
              )}
            </Flex>
          )}
        </Flex>
      )}

      <AddCustomServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onInstalled={invalidateInstallations}
      />

      <UninstallConfirmDialog
        serverName={
          uninstallTarget?.name ||
          uninstallTarget?.display_name ||
          "this server"
        }
        open={!!uninstallTarget}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null);
        }}
        onConfirm={handleUninstall}
        isPending={uninstallMutation.isPending}
      />
    </Flex>
  );
}
