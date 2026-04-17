import { getAuthenticatedClient } from "@features/auth/hooks/authClient";
import {
  SeatPaymentFailedError,
  SeatSubscriptionRequiredError,
} from "@renderer/api/posthogClient";
import type { SeatData } from "@shared/types/seat";
import { PLAN_FREE, PLAN_PRO } from "@shared/types/seat";
import { isFeatureFlagEnabled } from "@utils/analytics";
import { logger } from "@utils/logger";
import { getPostHogUrl } from "@utils/urls";
import { create } from "zustand";

const log = logger.scope("seat-store");

interface SeatStoreState {
  seat: SeatData | null;
  isLoading: boolean;
  error: string | null;
  redirectUrl: string | null;
}

interface SeatStoreActions {
  fetchSeat: (options?: { autoProvision?: boolean }) => Promise<void>;
  provisionFreeSeat: () => Promise<void>;
  upgradeToPro: () => Promise<void>;
  cancelSeat: () => Promise<void>;
  reactivateSeat: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type SeatStore = SeatStoreState & SeatStoreActions;

const BILLING_FLAG = "posthog-code-billing";

function assertBillingEnabled(): void {
  if (!isFeatureFlagEnabled(BILLING_FLAG)) {
    throw new Error("Billing is not enabled");
  }
}

async function getClient() {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error("Not authenticated");
  }
  return client;
}

function handleSeatError(
  error: unknown,
  set: (state: Partial<SeatStoreState>) => void,
): void {
  if (!(error instanceof Error)) {
    log.error("Seat operation failed", error);
    set({ isLoading: false, error: "An unexpected error occurred" });
    return;
  }

  if (error instanceof SeatSubscriptionRequiredError) {
    set({
      isLoading: false,
      error: "Billing subscription required",
      redirectUrl: getPostHogUrl("/organization/billing"),
    });
    return;
  }

  if (error instanceof SeatPaymentFailedError) {
    set({ isLoading: false, error: error.message });
    return;
  }

  log.error("Seat operation failed", error);
  set({ isLoading: false, error: error.message });
}

const initialState: SeatStoreState = {
  seat: null,
  isLoading: false,
  error: null,
  redirectUrl: null,
};

export const useSeatStore = create<SeatStore>()((set) => ({
  ...initialState,

  fetchSeat: async (options?: { autoProvision?: boolean }) => {
    set({ isLoading: true, error: null, redirectUrl: null });
    try {
      assertBillingEnabled();
      const client = await getClient();
      let seat = await client.getMySeat();
      if (!seat && options?.autoProvision) {
        log.info("No seat found, auto-provisioning free plan");
        seat = await client.createSeat(PLAN_FREE);
      }
      set({ seat, isLoading: false });
    } catch (error) {
      handleSeatError(error, set);
    }
  },

  provisionFreeSeat: async () => {
    log.info("Provisioning free seat");
    set({ isLoading: true, error: null, redirectUrl: null });
    try {
      assertBillingEnabled();
      const client = await getClient();
      const existing = await client.getMySeat();
      if (existing) {
        log.info("Seat already exists on server", {
          plan: existing.plan_key,
          status: existing.status,
        });
        set({ seat: existing, isLoading: false });
        return;
      }
      const seat = await client.createSeat(PLAN_FREE);
      log.info("Free seat created", { id: seat.id, plan: seat.plan_key });
      set({ seat, isLoading: false });
    } catch (error) {
      log.error("provisionFreeSeat failed", error);
      handleSeatError(error, set);
    }
  },

  upgradeToPro: async () => {
    set({ isLoading: true, error: null, redirectUrl: null });
    try {
      assertBillingEnabled();
      const client = await getClient();
      const existing = await client.getMySeat();
      if (existing) {
        if (existing.plan_key === PLAN_PRO) {
          set({ seat: existing, isLoading: false });
          return;
        }
        const seat = await client.upgradeSeat(PLAN_PRO);
        set({ seat, isLoading: false });
        return;
      }
      const seat = await client.createSeat(PLAN_PRO);
      set({ seat, isLoading: false });
    } catch (error) {
      handleSeatError(error, set);
    }
  },

  cancelSeat: async () => {
    set({ isLoading: true, error: null, redirectUrl: null });
    try {
      assertBillingEnabled();
      const client = await getClient();
      await client.cancelSeat();
      const seat = await client.getMySeat();
      set({ seat, isLoading: false });
    } catch (error) {
      handleSeatError(error, set);
    }
  },

  reactivateSeat: async () => {
    set({ isLoading: true, error: null, redirectUrl: null });
    try {
      assertBillingEnabled();
      const client = await getClient();
      const seat = await client.reactivateSeat();
      set({ seat, isLoading: false });
    } catch (error) {
      handleSeatError(error, set);
    }
  },

  clearError: () => set({ error: null, redirectUrl: null }),

  reset: () => set(initialState),
}));
