import { useUsageLimitStore } from "@features/billing/stores/usageLimitStore";
import { isUsageExceeded } from "@features/billing/utils";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useSeat } from "@hooks/useSeat";
import { useEffect, useRef } from "react";
import { useUsage } from "./useUsage";

export function useUsageLimitDetection(billingEnabled: boolean) {
  const { isPro } = useSeat();
  const { usage } = useUsage({ enabled: billingEnabled && !isPro });
  const hasAlertedRef = useRef(false);

  useEffect(() => {
    if (!billingEnabled || isPro || !usage) return;

    const exceeded = isUsageExceeded(usage);

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
