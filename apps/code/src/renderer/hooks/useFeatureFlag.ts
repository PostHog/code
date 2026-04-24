import { isFeatureFlagEnabled, onFeatureFlagsLoaded } from "@utils/analytics";
import { useEffect, useState } from "react";

export function useFeatureFlag(
  flagKey: string,
  defaultValue: boolean = false,
): boolean {
  const [enabled, setEnabled] = useState(
    () => isFeatureFlagEnabled(flagKey) || defaultValue,
  );

  useEffect(() => {
    // Update immediately in case flags loaded between render and effect
    setEnabled(isFeatureFlagEnabled(flagKey) || defaultValue);

    // Subscribe to flag reloads (e.g. after identify, or periodic refresh)
    return onFeatureFlagsLoaded(() => {
      setEnabled(isFeatureFlagEnabled(flagKey) || defaultValue);
    });
  }, [flagKey, defaultValue]);

  return enabled;
}
