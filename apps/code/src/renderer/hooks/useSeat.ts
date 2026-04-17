import { useSeatStore } from "@features/billing/stores/seatStore";
import { PLAN_PRO, seatHasAccess } from "@shared/types/seat";

export function useSeat() {
  const seat = useSeatStore((s) => s.seat);
  const isLoading = useSeatStore((s) => s.isLoading);
  const error = useSeatStore((s) => s.error);
  const redirectUrl = useSeatStore((s) => s.redirectUrl);

  const isPro = seat?.plan_key === PLAN_PRO;
  const hasAccess = seat ? seatHasAccess(seat.status) : false;
  const isCanceling = seat?.status === "canceling";
  const planLabel = isPro ? "Pro" : "Free";
  const activeUntil = seat?.active_until
    ? new Date(seat.active_until * 1000)
    : null;

  return {
    seat,
    isLoading,
    error,
    redirectUrl,
    isPro,
    hasAccess,
    isCanceling,
    planLabel,
    activeUntil,
  };
}
