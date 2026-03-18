import { useAuthStore } from "@features/auth/stores/authStore";
import type { SignalSourceValues } from "@features/inbox/components/SignalSourceToggles";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useExternalDataSources } from "./useExternalDataSources";
import { useSignalSourceConfigs } from "./useSignalSourceConfigs";

type SourceProduct =
  | "session_replay"
  | "llm_analytics"
  | "github"
  | "linear"
  | "zendesk";
type SourceType =
  | "session_analysis_cluster"
  | "evaluation"
  | "issue"
  | "ticket";

const SOURCE_TYPE_MAP: Record<SourceProduct, SourceType> = {
  session_replay: "session_analysis_cluster",
  llm_analytics: "evaluation",
  github: "issue",
  linear: "issue",
  zendesk: "ticket",
};

const DATA_WAREHOUSE_SOURCES: Record<
  string,
  { dwSourceType: string; requiredTable: string }
> = {
  github: { dwSourceType: "Github", requiredTable: "issues" },
  linear: { dwSourceType: "Linear", requiredTable: "issues" },
  zendesk: { dwSourceType: "Zendesk", requiredTable: "tickets" },
};

const ALL_SOURCE_PRODUCTS: SourceProduct[] = [
  "session_replay",
  "llm_analytics",
  "github",
  "linear",
  "zendesk",
];

export function useSignalSourceManager() {
  const projectId = useAuthStore((s) => s.projectId);
  const client = useAuthStore((s) => s.client);
  const queryClient = useQueryClient();
  const { data: configs, isLoading: configsLoading } = useSignalSourceConfigs();
  const { data: externalSources, isLoading: sourcesLoading } =
    useExternalDataSources();
  const savingRef = useRef(false);
  const [optimistic, setOptimistic] = useState<SignalSourceValues | null>(null);
  const [setupSource, setSetupSource] = useState<
    "github" | "linear" | "zendesk" | null
  >(null);
  const [loadingSources, setLoadingSources] = useState<
    Partial<Record<keyof SignalSourceValues, boolean>>
  >({});

  const isLoading = configsLoading || sourcesLoading;

  const findExternalSource = useCallback(
    (product: string) => {
      const dwConfig = DATA_WAREHOUSE_SOURCES[product];
      if (!dwConfig || !externalSources) return null;
      return externalSources.find(
        (s) =>
          s.source_type.toLowerCase() === dwConfig.dwSourceType.toLowerCase(),
      );
    },
    [externalSources],
  );

  const serverValues = useMemo<SignalSourceValues>(() => {
    const result: SignalSourceValues = {
      session_replay: false,
      llm_analytics: false,
      github: false,
      linear: false,
      zendesk: false,
    };
    for (const product of ALL_SOURCE_PRODUCTS) {
      result[product] = !!configs?.some(
        (c) => c.source_product === product && c.enabled,
      );
    }
    return result;
  }, [configs]);

  const displayValues = optimistic ?? serverValues;

  const sourceStates = useMemo(() => {
    const states: Partial<
      Record<
        keyof SignalSourceValues,
        { requiresSetup: boolean; loading: boolean }
      >
    > = {};
    for (const product of ["github", "linear", "zendesk"] as const) {
      const hasExternalSource = !!findExternalSource(product);
      const isEnabled = serverValues[product];
      states[product] = {
        requiresSetup: !hasExternalSource && !isEnabled,
        loading: !!loadingSources[product],
      };
    }
    return states;
  }, [findExternalSource, serverValues, loadingSources]);

  const createConfig = useAuthenticatedMutation(
    (
      apiClient,
      options: {
        source_product: SourceProduct;
        source_type: SourceType;
      },
    ) =>
      projectId
        ? apiClient.createSignalSourceConfig(projectId, {
            ...options,
            enabled: true,
          })
        : Promise.reject(new Error("No project selected")),
  );

  const updateConfig = useAuthenticatedMutation(
    (apiClient, options: { configId: string; enabled: boolean }) =>
      projectId
        ? apiClient.updateSignalSourceConfig(projectId, options.configId, {
            enabled: options.enabled,
          })
        : Promise.reject(new Error("No project selected")),
  );

  const ensureRequiredTableSyncing = useCallback(
    async (product: string) => {
      if (!projectId || !client) return;
      const dwConfig = DATA_WAREHOUSE_SOURCES[product];
      if (!dwConfig) return;

      const source = findExternalSource(product);
      if (!source?.schemas || !Array.isArray(source.schemas)) return;

      const requiredSchema = source.schemas.find(
        (s) => s.name.toLowerCase() === dwConfig.requiredTable,
      );
      if (requiredSchema && !requiredSchema.should_sync) {
        await client.updateExternalDataSchema(projectId, requiredSchema.id, {
          should_sync: true,
        });
      }
    },
    [projectId, client, findExternalSource],
  );

  const handleSetup = useCallback((source: keyof SignalSourceValues) => {
    if (source === "github" || source === "linear" || source === "zendesk") {
      setSetupSource(source);
    }
  }, []);

  const handleSetupComplete = useCallback(async () => {
    const completedSource = setupSource;
    setSetupSource(null);

    // Create the signal source config for the source that was just connected
    if (completedSource) {
      const existing = configs?.find(
        (c) => c.source_product === completedSource,
      );
      if (!existing) {
        try {
          await createConfig.mutateAsync({
            source_product: completedSource,
            source_type: SOURCE_TYPE_MAP[completedSource],
          });
        } catch {
          toast.error(
            "Data source connected, but failed to enable signal source. Try toggling it on.",
          );
        }
      } else if (!existing.enabled) {
        try {
          await updateConfig.mutateAsync({
            configId: existing.id,
            enabled: true,
          });
        } catch {
          toast.error(
            "Data source connected, but failed to enable signal source. Try toggling it on.",
          );
        }
      }
    }

    await queryClient.invalidateQueries({
      queryKey: ["external-data-sources"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["signals", "source-configs"],
    });
  }, [queryClient, setupSource, configs, createConfig, updateConfig]);

  const handleSetupCancel = useCallback(() => {
    setSetupSource(null);
  }, []);

  const handleChange = useCallback(
    async (values: SignalSourceValues) => {
      if (savingRef.current) return;

      setOptimistic(values);
      try {
        const operations: Array<() => Promise<unknown>> = [];

        for (const product of ALL_SOURCE_PRODUCTS) {
          const wanted = values[product];
          const current = serverValues[product];
          if (wanted === current) continue;

          // If enabling a warehouse source without an external data source, open setup
          if (wanted && product in DATA_WAREHOUSE_SOURCES) {
            const hasExternalSource = !!findExternalSource(product);
            if (!hasExternalSource) {
              setSetupSource(product as "github" | "linear" | "zendesk");
              return;
            }

            // Ensure required table is syncing
            setLoadingSources((prev) => ({ ...prev, [product]: true }));
            try {
              await ensureRequiredTableSyncing(product);
            } finally {
              setLoadingSources((prev) => ({ ...prev, [product]: false }));
            }
          }

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
          return;
        }

        savingRef.current = true;
        const results = await Promise.allSettled(operations.map((op) => op()));
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          toast.error("Failed to update signal sources. Please try again.");
          return;
        }

        await queryClient.invalidateQueries({
          queryKey: ["signals", "source-configs"],
        });
      } catch {
        toast.error("Failed to update signal sources. Please try again.");
      } finally {
        savingRef.current = false;
        setOptimistic(null);
      }
    },
    [
      serverValues,
      configs,
      createConfig,
      updateConfig,
      queryClient,
      findExternalSource,
      ensureRequiredTableSyncing,
    ],
  );

  return {
    displayValues,
    sourceStates,
    setupSource,
    isLoading,
    handleChange,
    handleSetup,
    handleSetupComplete,
    handleSetupCancel,
  };
}
