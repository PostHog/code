import { isFeatureFlagEnabled, onFeatureFlagsLoaded } from "@utils/analytics";
import { useEffect, useState } from "react";

// only if in dev
const IS_DEV = import.meta.env.DEV;

export function useFeatureFlag(
  flagKey: string,
  defaultValue: boolean = false,
): boolean {
  const [enabled, setEnabled] = useState(
    () => IS_DEV || isFeatureFlagEnabled(flagKey) || defaultValue,
  );

  useEffect(() => {
    if (IS_DEV) {
      setEnabled(true);
      return;
    }

    // Update immediately in case flags loaded between render and effect
    setEnabled(isFeatureFlagEnabled(flagKey) || defaultValue);

    // Subscribe to flag reloads (e.g. after identify, or periodic refresh)
    return onFeatureFlagsLoaded(() => {
      setEnabled(isFeatureFlagEnabled(flagKey) || defaultValue);
    });
  }, [flagKey, defaultValue]);

  return enabled;
}
