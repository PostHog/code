import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { getEffortOptions } from "@posthog/agent/adapters/claude/session/models";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { logger } from "@utils/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const log = logger.scope("preview-config");

interface PreviewConfigResult {
  configOptions: SessionConfigOption[];
  modeOption: SessionConfigOption | undefined;
  modelOption: SessionConfigOption | undefined;
  thoughtOption: SessionConfigOption | undefined;
  isLoading: boolean;
  setConfigOption: (configId: string, value: string) => void;
}

function getOptionByCategory(
  options: SessionConfigOption[],
  category: string,
): SessionConfigOption | undefined {
  return options.find(
    (opt) => opt.category === category || opt.id === category,
  );
}

/**
 * Fetches config options (models, modes, effort levels) for the task input
 * page via a lightweight tRPC query. No agent session is created.
 *
 * Returns config options as local state with a setter for local updates.
 */
export function usePreviewConfig(
  adapter: "claude" | "codex",
): PreviewConfigResult {
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const apiHost = useMemo(
    () => (cloudRegion ? getCloudUrlFromRegion(cloudRegion) : null),
    [cloudRegion],
  );
  const [configOptions, setConfigOptions] = useState<SessionConfigOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!apiHost) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsLoading(true);

    trpcClient.agent.getPreviewConfigOptions
      .query({ apiHost, adapter })
      .then((options) => {
        if (abort.signal.aborted) return;

        const { defaultInitialTaskMode, lastUsedInitialTaskMode } =
          useSettingsStore.getState();

        // Use the mode option's existing currentValue (set by the server
        // based on the adapter) when the user hasn't chosen a preference,
        // or when their last-used mode doesn't match the current adapter's
        // available modes.
        const modeOpt = options.find((o) => o.id === "mode");
        const serverDefault = modeOpt?.currentValue;
        const availableValues: string[] =
          modeOpt?.type === "select"
            ? (
                modeOpt.options as Array<{
                  value?: string;
                  options?: Array<{ value: string }>;
                }>
              ).flatMap((o) =>
                o.options
                  ? o.options.map((go) => go.value)
                  : o.value
                    ? [o.value]
                    : [],
              )
            : [];

        let initialMode: string;
        if (
          defaultInitialTaskMode === "last_used" &&
          lastUsedInitialTaskMode &&
          availableValues.includes(lastUsedInitialTaskMode)
        ) {
          initialMode = lastUsedInitialTaskMode;
        } else {
          initialMode =
            typeof serverDefault === "string" ? serverDefault : "plan";
        }

        const withMode = options.map((opt) =>
          opt.id === "mode"
            ? ({ ...opt, currentValue: initialMode } as SessionConfigOption)
            : opt,
        );

        setConfigOptions(withMode);
        setIsLoading(false);
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        log.error("Failed to fetch preview config options", { error });
        setIsLoading(false);
      });

    return () => {
      abort.abort();
    };
  }, [adapter, apiHost]);

  const setConfigOption = useCallback((configId: string, value: string) => {
    setConfigOptions((prev) => {
      let updated = prev.map((opt) =>
        opt.id === configId
          ? ({ ...opt, currentValue: value } as SessionConfigOption)
          : opt,
      );

      if (configId === "model") {
        const effortOpts = getEffortOptions(value);
        const existingIdx = updated.findIndex((o) => o.id === "effort");

        if (effortOpts && existingIdx >= 0) {
          const currentEffort = updated[existingIdx].currentValue;
          const validEffort = effortOpts.some((e) => e.value === currentEffort)
            ? currentEffort
            : "high";
          updated[existingIdx] = {
            ...updated[existingIdx],
            currentValue: validEffort,
            options: effortOpts,
          } as SessionConfigOption;
        } else if (effortOpts && existingIdx === -1) {
          updated = [
            ...updated,
            {
              id: "effort",
              name: "Effort",
              type: "select",
              currentValue: "high",
              options: effortOpts,
              category: "thought_level",
              description:
                "Controls how much effort Claude puts into its response",
            } as SessionConfigOption,
          ];
        } else if (!effortOpts && existingIdx >= 0) {
          updated = updated.filter((o) => o.id !== "effort");
        }
      }

      return updated;
    });
  }, []);

  const modeOption = getOptionByCategory(configOptions, "mode");
  const modelOption = getOptionByCategory(configOptions, "model");
  const thoughtOption = getOptionByCategory(configOptions, "thought_level");

  return {
    configOptions,
    modeOption,
    modelOption,
    thoughtOption,
    isLoading,
    setConfigOption,
  };
}
