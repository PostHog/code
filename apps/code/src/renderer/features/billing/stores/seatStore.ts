import { useAuthStore } from "@features/auth/stores/authStore";
import type { SeatData } from "@shared/types/seat";
import { PLAN_FREE, PLAN_PRO } from "@shared/types/seat";
import { electronStorage } from "@utils/electronStorage";
import { logger } from "@utils/logger";
import { getPostHogUrl } from "@utils/urls";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const log = logger.scope("seat-store");

interface SeatStoreState {
  seat: SeatData | null;
  isLoading: boolean;
  error: string | null;
  redirectUrl: string | null;
}

interface SeatStoreActions {
  fetchSeat: () => Promise<void>;
  provisionFreeSeat: () => Promise<void>;
  upgradeToPro: () => Promise<void>;
  cancelSeat: () => Promise<void>;
  reactivateSeat: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type SeatStore = SeatStoreState & SeatStoreActions;

function getClient() {
  const client = useAuthStore.getState().client;
  if (!client) {
    throw new Error("Not authenticated");
  }
  return client;
}

function parseFetcherError(
  error: Error,
): { status: number; body: Record<string, unknown> } | null {
  const match = error.message.match(/\[(\d+)\]\s*(.*)/);
  if (!match) return null;
  try {
    return {
      status: Number.parseInt(match[1], 10),
      body: JSON.parse(match[2]) as Record<string, unknown>,
    };
  } catch {
    return { status: Number.parseInt(match[1], 10), body: {} };
  }
}

function getBillingUrl(): string {
  return getPostHogUrl("/organization/billing");
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

  const billingUrl = getBillingUrl();

  if (
    "redirectUrl" in error &&
    typeof (error as { redirectUrl: unknown }).redirectUrl === "string"
  ) {
    set({
      isLoading: false,
      error: "Billing subscription required",
      redirectUrl: billingUrl,
    });
    return;
  }

  const parsed = parseFetcherError(error);
  if (parsed) {
    if (parsed.status === 400 && typeof parsed.body.redirect_url === "string") {
      set({
        isLoading: false,
        error:
          typeof parsed.body.error === "string"
            ? parsed.body.error
            : "Billing subscription required",
        redirectUrl: billingUrl,
      });
      return;
    }
    if (parsed.status === 402) {
      set({
        isLoading: false,
        error:
          typeof parsed.body.error === "string"
            ? parsed.body.error
            : "Payment failed",
      });
      return;
    }
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

export const useSeatStore = create<SeatStore>()(
  persist(
    (set) => ({
      ...initialState,

      fetchSeat: async () => {
        set({ isLoading: true, error: null, redirectUrl: null });
        try {
          const client = getClient();
          let seat = await client.getMySeat();
          if (!seat) {
            log.info("No seat found, auto-provisioning free plan");
            seat = await client.createSeat(PLAN_FREE);
          }
          set({ seat, isLoading: false });
        } catch (error) {
          handleSeatError(error, set);
        }
      },

      provisionFreeSeat: async () => {
        set({ isLoading: true, error: null, redirectUrl: null });
        try {
          const client = getClient();
          const existing = await client.getMySeat();
          if (existing) {
            set({ seat: existing, isLoading: false });
            return;
          }
          const seat = await client.createSeat(PLAN_FREE);
          set({ seat, isLoading: false });
        } catch (error) {
          handleSeatError(error, set);
        }
      },

      upgradeToPro: async () => {
        set({ isLoading: true, error: null, redirectUrl: null });
        try {
          const client = getClient();
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
          const client = getClient();
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
          const client = getClient();
          const seat = await client.reactivateSeat();
          set({ seat, isLoading: false });
        } catch (error) {
          handleSeatError(error, set);
        }
      },

      clearError: () => set({ error: null, redirectUrl: null }),

      reset: () => set(initialState),
    }),
    {
      name: "posthog-code-seat",
      storage: electronStorage,
      partialize: (state) => ({ seat: state.seat }),
    },
  ),
);
