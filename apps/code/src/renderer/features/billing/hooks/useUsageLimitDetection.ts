import { useUsageLimitStore } from "@features/billing/stores/usageLimitStore";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useSeat } from "@hooks/useSeat";
import { useEffect, useRef } from "react";
import { useUsage } from "./useUsage";

function isExceeded(usage: {
  sustained: { exceeded: boolean };
  burst: { exceeded: boolean };
  is_rate_limited: boolean;
}): boolean {
  return (
    usage.is_rate_limited || usage.sustained.exceeded || usage.burst.exceeded
  );
}

export function useUsageLimitDetection() {
  const billingEnabled = useFeatureFlag("posthog-code-billing");
  const { isPro } = useSeat();
  const { usage } = useUsage();
  const hasAlertedRef = useRef(false);

  useEffect(() => {
    if (!billingEnabled || isPro || !usage) return;

    const exceeded = isExceeded(usage);

    if (exceeded && !hasAlertedRef.current) {
      hasAlertedRef.current = true;

      const sessions = useSessionStore.getState().sessions;
      const hasActiveSession = Object.values(sessions).some(
        (s) => s.status === "connected" && s.isPromptPending,
      );

      useUsageLimitStore
        .getState()
        .show(hasActiveSession ? "mid-task" : "idle");
    }

    if (!exceeded) {
      hasAlertedRef.current = false;
    }
  }, [billingEnabled, isPro, usage]);
}
