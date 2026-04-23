import { useSeat } from "@hooks/useSeat";
import type { UsageOutput } from "@main/services/llm-gateway/schemas";
import { useUsage } from "./useUsage";

export function useFreeUsage(billingEnabled: boolean): UsageOutput | null {
  const { seat, isPro } = useSeat();
  const seatLoaded = seat !== null;
  const { usage } = useUsage({
    enabled: billingEnabled && seatLoaded && !isPro,
  });

  if (!billingEnabled || !seatLoaded || isPro || !usage) return null;
  return usage;
}
