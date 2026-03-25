import { useAuthStore } from "@features/auth/stores/authStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  ScrollArea,
  Select,
  Switch,
  Text,
} from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearApplicationStorage } from "@utils/clearStorage";
import { useState } from "react";
import { toast } from "sonner";

const MEMORY_TYPE_COLORS: Record<
  string,
  "blue" | "green" | "orange" | "red" | "purple" | "cyan" | "yellow" | "gray"
> = {
  identity: "blue",
  goal: "green",
  decision: "orange",
  todo: "red",
  preference: "purple",
  fact: "cyan",
  event: "yellow",
  observation: "gray",
};

function MemoryBrowser() {
  const trpc = useTRPC();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: memories,
    isLoading,
    refetch,
    isFetching,
    error,
  } = useQuery(
    trpc.memory.list.queryOptions(
      typeFilter !== "all" ? { memoryType: typeFilter } : undefined,
    ),
  );

  const { data: associations } = useQuery({
    ...trpc.memory.associations.queryOptions({ memoryId: expandedId ?? "" }),
    enabled: !!expandedId,
  });

  return (
    <Box>
      <Flex align="center" justify="between" mb="3">
        <Flex align="center" gap="2">
          <Select.Root value={typeFilter} onValueChange={setTypeFilter}>
            <Select.Trigger variant="soft" />
            <Select.Content>
              <Select.Item value="all">All types</Select.Item>
              <Select.Item value="identity">Identity</Select.Item>
              <Select.Item value="goal">Goal</Select.Item>
              <Select.Item value="decision">Decision</Select.Item>
              <Select.Item value="todo">Todo</Select.Item>
              <Select.Item value="preference">Preference</Select.Item>
              <Select.Item value="fact">Fact</Select.Item>
              <Select.Item value="event">Event</Select.Item>
              <Select.Item value="observation">Observation</Select.Item>
            </Select.Content>
          </Select.Root>
          <Text size="1" color="gray">
            {memories?.length ?? 0} memories
          </Text>
        </Flex>
        <Button
          variant="ghost"
          size="1"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Loading..." : "Refresh"}
        </Button>
      </Flex>

      {error ? (
        <Text size="1" color="red">
          Error loading memories: {error.message}. Try restarting the app.
        </Text>
      ) : isLoading ? (
        <Text size="1" color="gray">
          Loading memories...
        </Text>
      ) : memories && memories.length > 0 ? (
        <ScrollArea style={{ maxHeight: 400 }}>
          <Flex direction="column" gap="2">
            {memories.map((memory) => (
              <Box
                key={memory.id}
                className="cursor-pointer rounded border border-gray-5 p-2 transition-colors hover:border-gray-7"
                onClick={() =>
                  setExpandedId(expandedId === memory.id ? null : memory.id)
                }
              >
                <Flex align="start" justify="between" gap="2">
                  <Flex
                    direction="column"
                    gap="1"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <Flex align="center" gap="2">
                      <Badge
                        size="1"
                        color={MEMORY_TYPE_COLORS[memory.memoryType] ?? "gray"}
                      >
                        {memory.memoryType}
                      </Badge>
                      <Text size="1" color="gray">
                        importance: {memory.importance.toFixed(2)}
                      </Text>
                      {memory.forgotten && (
                        <Badge size="1" color="red" variant="outline">
                          forgotten
                        </Badge>
                      )}
                    </Flex>
                    <Text size="1" className="break-words">
                      {memory.content}
                    </Text>
                  </Flex>
                </Flex>

                {expandedId === memory.id && (
                  <Box mt="2" pt="2" className="border-gray-5 border-t">
                    <Flex direction="column" gap="1">
                      <Text size="1" color="gray">
                        ID: <Code size="1">{memory.id}</Code>
                      </Text>
                      <Text size="1" color="gray">
                        Source: {memory.source ?? "none"}
                      </Text>
                      <Text size="1" color="gray">
                        Created: {memory.createdAt}
                      </Text>
                      <Text size="1" color="gray">
                        Updated: {memory.updatedAt}
                      </Text>
                      <Text size="1" color="gray">
                        Last accessed: {memory.lastAccessedAt} (
                        {memory.accessCount}x)
                      </Text>
                      {associations && associations.length > 0 && (
                        <Box mt="1">
                          <Text size="1" weight="medium" color="gray">
                            Associations ({associations.length}):
                          </Text>
                          {associations.map((assoc) => (
                            <Text
                              key={assoc.id}
                              size="1"
                              color="gray"
                              className="ml-2 block"
                            >
                              {assoc.relationType} &rarr;{" "}
                              <Code size="1">
                                {assoc.sourceId === memory.id
                                  ? assoc.targetId.slice(0, 8)
                                  : assoc.sourceId.slice(0, 8)}
                                ...
                              </Code>{" "}
                              (weight: {assoc.weight.toFixed(2)})
                            </Text>
                          ))}
                        </Box>
                      )}
                    </Flex>
                  </Box>
                )}
              </Box>
            ))}
          </Flex>
        </ScrollArea>
      ) : (
        <Text size="1" color="gray">
          No memories stored.
        </Text>
      )}
    </Box>
  );
}

export function AdvancedSettings() {
  const showDebugLogsToggle = useFeatureFlag(
    "posthog-code-background-agent-logs",
  );
  const debugLogsCloudRuns = useSettingsStore((s) => s.debugLogsCloudRuns);
  const setDebugLogsCloudRuns = useSettingsStore(
    (s) => s.setDebugLogsCloudRuns,
  );
  const [showMemoryBrowser, setShowMemoryBrowser] = useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: memoryCount } = useQuery(trpc.memory.count.queryOptions());

  const seedMutation = useMutation(
    trpc.memory.seed.mutationOptions({
      onSuccess: (count) => {
        toast.success(`Seeded ${count} memories`);
        queryClient.invalidateQueries({
          queryKey: trpc.memory.count.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.memory.list.queryKey(),
        });
      },
      onError: () => {
        toast.error("Failed to seed memory database");
      },
    }),
  );

  const resetMutation = useMutation(
    trpc.memory.reset.mutationOptions({
      onSuccess: () => {
        toast.success("Memory database reset");
        queryClient.invalidateQueries({
          queryKey: trpc.memory.count.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.memory.list.queryKey(),
        });
      },
      onError: () => {
        toast.error("Failed to reset memory database");
      },
    }),
  );

  return (
    <Flex direction="column">
      <SettingRow
        label="Reset onboarding"
        description="Re-run the onboarding tutorial on next app restart"
      >
        <Button
          variant="soft"
          size="1"
          onClick={() =>
            useAuthStore.setState({ hasCompletedOnboarding: false })
          }
        >
          Reset
        </Button>
      </SettingRow>
      <SettingRow
        label="Clear application storage"
        description="This will remove all locally stored application data"
      >
        <Button
          variant="soft"
          color="red"
          size="1"
          onClick={clearApplicationStorage}
        >
          Clear all data
        </Button>
      </SettingRow>

      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Knowledge Graph Memory
      </Text>

      <SettingRow
        label="Seed memory database"
        description={
          <Text size="1" color="gray">
            Populate with synthetic data for development.{" "}
            {memoryCount != null && `Currently ${memoryCount} memories stored.`}
          </Text>
        }
      >
        <Button
          variant="soft"
          size="1"
          disabled={seedMutation.isPending}
          onClick={() => seedMutation.mutate()}
        >
          {seedMutation.isPending ? "Seeding..." : "Seed data"}
        </Button>
      </SettingRow>
      <SettingRow
        label="Reset memory database"
        description="Delete all memories and associations"
      >
        <Button
          variant="soft"
          color="red"
          size="1"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
        >
          {resetMutation.isPending ? "Resetting..." : "Reset"}
        </Button>
      </SettingRow>
      <SettingRow
        label="Browse memory data"
        description="Inspect raw memory records and associations"
        noBorder={!showDebugLogsToggle && !showMemoryBrowser}
      >
        <Button
          variant="soft"
          size="1"
          onClick={() => setShowMemoryBrowser(!showMemoryBrowser)}
        >
          {showMemoryBrowser ? "Hide" : "Browse"}
        </Button>
      </SettingRow>

      {showMemoryBrowser && (
        <Box mb="4">
          <MemoryBrowser />
        </Box>
      )}

      {showDebugLogsToggle && (
        <SettingRow
          label="Debug logs for cloud runs"
          description="Show debug-level console output in the conversation view for cloud-executed runs"
          noBorder
        >
          <Switch
            checked={debugLogsCloudRuns}
            onCheckedChange={setDebugLogsCloudRuns}
            size="1"
          />
        </SettingRow>
      )}
    </Flex>
  );
}
