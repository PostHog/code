export type SeatStatus =
  | "active"
  | "canceling"
  | "pending"
  | "pending_payment"
  | "expired"
  | "withdrawn";

export interface SeatData {
  id: number;
  user_distinct_id: string;
  product_key: string;
  plan_key: string;
  status: SeatStatus;
  end_reason: string | null;
  created_at: number;
  active_until: number | null;
  active_from: number;
}

export const SEAT_PRODUCT_KEY = "posthog_code";
export const PLAN_FREE = "posthog-code-free-20260301";
export const PLAN_PRO = "posthog-code-200-20260301";

export function seatHasAccess(status: SeatStatus): boolean {
  return status === "active" || status === "canceling";
}
