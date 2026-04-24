import { useUsageLimitStore } from "@features/billing/stores/usageLimitStore";
import { isUsageExceeded } from "@features/billing/utils";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useEffect, useRef } from "react";
import { useFreeUsage } from "./useFreeUsage";

export function useUsageLimitDetection(billingEnabled: boolean) {
  const usage = useFreeUsage(billingEnabled);
  const hasAlertedRef = useRef(false);

  useEffect(() => {
    if (!billingEnabled) {
      hasAlertedRef.current = false;
    }
  }, [billingEnabled]);

  useEffect(() => {
    if (!usage) return;

    const exceeded = isUsageExceeded(usage);

    if (exceeded && !hasAlertedRef.current) {
      const sessions = useSessionStore.getState().sessions;
      const hasActiveSession = Object.values(sessions).some(
        (s) => s.status === "connected" && s.isPromptPending,
      );

      if (hasActiveSession) {
        hasAlertedRef.current = true;
        useUsageLimitStore.getState().show();
      }
    }

    if (!exceeded) {
      hasAlertedRef.current = false;
    }
  }, [usage]);
}
