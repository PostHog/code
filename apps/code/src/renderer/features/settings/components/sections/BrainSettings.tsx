import { SettingRow } from "@features/settings/components/SettingRow";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  ScrollArea,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredMemories = memories?.filter((memory) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      memory.content.toLowerCase().includes(q) ||
      memory.memoryType.toLowerCase().includes(q) ||
      memory.source?.toLowerCase().includes(q)
    );
  });

  const { data: associations } = useQuery({
    ...trpc.memory.associations.queryOptions({ memoryId: expandedId ?? "" }),
    enabled: !!expandedId,
  });

  return (
    <Flex direction="column" gap="3">
      <TextField.Root
        placeholder="Search memories..."
        size="2"
        variant="soft"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlass size={14} />
        </TextField.Slot>
      </TextField.Root>

      <Flex align="center" justify="between">
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
            {filteredMemories?.length ?? 0} memories
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
      ) : filteredMemories && filteredMemories.length > 0 ? (
        <ScrollArea style={{ maxHeight: 400 }}>
          <Flex direction="column" gap="2">
            {filteredMemories.map((memory) => (
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
          {searchQuery ? "No matching memories." : "No memories stored."}
        </Text>
      )}
    </Flex>
  );
}

export function BrainSettings() {
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
        queryClient.invalidateQueries({
          queryKey: trpc.memory.graph.queryKey(),
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
        queryClient.invalidateQueries({
          queryKey: trpc.memory.graph.queryKey(),
        });
      },
      onError: () => {
        toast.error("Failed to reset memory database");
      },
    }),
  );

  const maintenanceMutation = useMutation(
    trpc.memory.maintenance.mutationOptions({
      onSuccess: ({ decayed, pruned, consolidated }) => {
        toast.success(
          `Maintenance: decayed ${decayed}, pruned ${pruned}, consolidated ${consolidated}`,
        );
        queryClient.invalidateQueries({
          queryKey: trpc.memory.count.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.memory.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.memory.graph.queryKey(),
        });
      },
      onError: () => {
        toast.error("Failed to run memory maintenance");
      },
    }),
  );

  const pruneEdgesMutation = useMutation(
    trpc.memory.pruneWeakEdges.mutationOptions({
      onSuccess: (pruned) => {
        toast.success(`Pruned ${pruned} weak edges`);
        queryClient.invalidateQueries({
          queryKey: trpc.memory.graph.queryKey(),
        });
      },
      onError: () => {
        toast.error("Failed to prune weak edges");
      },
    }),
  );

  return (
    <Flex direction="column">
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
        label="Run maintenance"
        description="Decay old memory importance and prune low-value memories"
      >
        <Button
          variant="soft"
          size="1"
          disabled={maintenanceMutation.isPending}
          onClick={() => maintenanceMutation.mutate()}
        >
          {maintenanceMutation.isPending ? "Running..." : "Maintain"}
        </Button>
      </SettingRow>

      <Box className="border-gray-6 border-t pt-4">
        <Text size="2" weight="medium" className="mb-3 block">
          Memory Browser
        </Text>
        <MemoryBrowser />
      </Box>
    </Flex>
  );
}
