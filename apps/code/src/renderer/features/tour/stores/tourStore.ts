import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TOUR_REGISTRY } from "../tours/tourRegistry";

interface TourStoreState {
  completedTourIds: string[];
  activeTourId: string | null;
  activeStepIndex: number;
}

interface TourStoreActions {
  startTour: (tourId: string) => void;
  advance: () => void;
  dismiss: () => void;
}

type TourStore = TourStoreState & TourStoreActions;

export const useTourStore = create<TourStore>()(
  persist(
    (set, get) => ({
      completedTourIds: [],
      activeTourId: null,
      activeStepIndex: 0,

      startTour: (tourId) => {
        if (get().completedTourIds.includes(tourId)) return;
        set({ activeTourId: tourId, activeStepIndex: 0 });
      },

      advance: () => {
        const { activeTourId, activeStepIndex } = get();
        if (!activeTourId) return;

        const tour = TOUR_REGISTRY[activeTourId];
        if (!tour) return;

        if (activeStepIndex >= tour.steps.length - 1) {
          set((state) => ({
            completedTourIds: [...state.completedTourIds, activeTourId],
            activeTourId: null,
            activeStepIndex: 0,
          }));
        } else {
          set({ activeStepIndex: activeStepIndex + 1 });
        }
      },

      dismiss: () => {
        const { activeTourId } = get();
        if (!activeTourId) return;
        set((state) => ({
          completedTourIds: [...state.completedTourIds, activeTourId],
          activeTourId: null,
          activeStepIndex: 0,
        }));
      },
    }),
    {
      name: "tour-store",
      partialize: (state) => ({
        completedTourIds: state.completedTourIds,
      }),
    },
  ),
);
