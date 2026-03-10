import { useAuthStore } from "@features/auth/stores/authStore";
import type { SignalSourceValues } from "@features/inbox/components/SignalSourceToggles";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { Flex, Text } from "@radix-ui/themes";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type SourceProduct = "session_replay" | "llm_analytics";
type SourceType = "session_analysis_cluster" | "evaluation";

const SOURCE_TYPE_MAP: Record<SourceProduct, SourceType> = {
  session_replay: "session_analysis_cluster",
  llm_analytics: "evaluation",
};

export function SignalSourcesSettings() {
  const projectId = useAuthStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const { data: configs, isLoading } = useSignalSourceConfigs();
  const savingRef = useRef(false);
  const [optimistic, setOptimistic] = useState<SignalSourceValues | null>(null);

  const serverValues = useMemo<SignalSourceValues>(() => {
    const sr = configs?.some(
      (c) => c.source_product === "session_replay" && c.enabled,
    );
    const llm = configs?.some(
      (c) => c.source_product === "llm_analytics" && c.enabled,
    );
    return { session_replay: !!sr, llm_analytics: !!llm };
  }, [configs]);

  const displayValues = optimistic ?? serverValues;

  const createConfig = useAuthenticatedMutation(
    (
      client,
      options: {
        source_product: SourceProduct;
        source_type: SourceType;
      },
    ) =>
      projectId
        ? client.createSignalSourceConfig(projectId, {
            ...options,
            enabled: true,
          })
        : Promise.reject(new Error("No project selected")),
  );

  const updateConfig = useAuthenticatedMutation(
    (client, options: { configId: string; enabled: boolean }) =>
      projectId
        ? client.updateSignalSourceConfig(projectId, options.configId, {
            enabled: options.enabled,
          })
        : Promise.reject(new Error("No project selected")),
  );

  const handleChange = useCallback(
    async (values: SignalSourceValues) => {
      if (savingRef.current) return;

      setOptimistic(values);

      const operations: Array<() => Promise<unknown>> = [];

      for (const product of [
        "session_replay",
        "llm_analytics",
      ] as SourceProduct[]) {
        const wanted = values[product];
        const current = serverValues[product];
        if (wanted === current) continue;

        const existing = configs?.find((c) => c.source_product === product);

        if (wanted && !existing) {
          operations.push(() =>
            createConfig.mutateAsync({
              source_product: product,
              source_type: SOURCE_TYPE_MAP[product],
            }),
          );
        } else if (existing) {
          operations.push(() =>
            updateConfig.mutateAsync({
              configId: existing.id,
              enabled: wanted,
            }),
          );
        }
      }

      if (operations.length === 0) {
        setOptimistic(null);
        return;
      }

      savingRef.current = true;
      const results = await Promise.allSettled(operations.map((op) => op()));
      savingRef.current = false;

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        setOptimistic(null);
        toast.error("Failed to update signal sources. Please try again.");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["signals", "source-configs"],
      });
      setOptimistic(null);
    },
    [serverValues, configs, createConfig, updateConfig, queryClient],
  );

  if (isLoading) {
    return (
      <Text size="1" color="gray">
        Loading signal source configurations...
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Text size="1" color="gray">
        Automatically analyze your product data and surface actionable insights.
        Choose which sources to enable for this project.
      </Text>

      <SignalSourceToggles
        value={displayValues}
        onChange={(v) => void handleChange(v)}
      />
    </Flex>
  );
}
