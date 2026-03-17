import { useAuthStore } from "@features/auth/stores/authStore";
import type { SeatSubscriptionRequiredError } from "@renderer/api/posthogClient";
import type { SeatData } from "@shared/types/seat";
import { PLAN_FREE, PLAN_PRO } from "@shared/types/seat";
import { electronStorage } from "@utils/electronStorage";
import { logger } from "@utils/logger";
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

function handleSeatError(
  error: unknown,
  set: (state: Partial<SeatStoreState>) => void,
): void {
  if (error instanceof Error) {
    if (
      error.name === "SeatSubscriptionRequiredError" &&
      "redirectUrl" in error
    ) {
      set({
        isLoading: false,
        error: "Billing subscription required",
        redirectUrl: (error as SeatSubscriptionRequiredError).redirectUrl,
      });
      return;
    }
    if (error.name === "SeatPaymentFailedError") {
      set({ isLoading: false, error: error.message });
      return;
    }
    log.error("Seat operation failed", error);
    set({ isLoading: false, error: error.message });
    return;
  }
  log.error("Seat operation failed", error);
  set({ isLoading: false, error: "An unexpected error occurred" });
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
          const seat = await client.getMySeat();
          set({ seat, isLoading: false });
        } catch (error) {
          handleSeatError(error, set);
        }
      },

      provisionFreeSeat: async () => {
        set({ isLoading: true, error: null, redirectUrl: null });
        try {
          const client = getClient();
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
          const currentSeat = useSeatStore.getState().seat;
          const seat = currentSeat
            ? await client.upgradeSeat(PLAN_PRO)
            : await client.createSeat(PLAN_PRO);
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
