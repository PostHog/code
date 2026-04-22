import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { track } from "@utils/analytics";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createFirstTaskTour } from "../tours/createFirstTaskTour";
import { TOUR_REGISTRY } from "../tours/tourRegistry";

interface TourStoreState {
  completedTourIds: string[];
  activeTourId: string | null;
  activeStepIndex: number;
}

interface TourStoreActions {
  startTour: (tourId: string) => void;
  advance: (tourId: string, stepId: string) => void;
  completeTour: (tourId: string) => void;
  dismiss: () => void;
  resetTours: () => void;
}

type TourStore = TourStoreState & TourStoreActions;

export const useTourStore = create<TourStore>()(
  persist(
    (set, get) => ({
      completedTourIds: [],
      activeTourId: null,
      activeStepIndex: 0,

      startTour: (tourId) => {
        const { completedTourIds, activeTourId } = get();
        if (completedTourIds.includes(tourId) || activeTourId === tourId)
          return;
        const tour = TOUR_REGISTRY[tourId];
        set({ activeTourId: tourId, activeStepIndex: 0 });
        track(ANALYTICS_EVENTS.TOUR_EVENT, {
          tour_id: tourId,
          action: "started",
          step_id: tour?.steps[0]?.id,
          step_index: 0,
          total_steps: tour?.steps.length,
        });
      },

      advance: (tourId, stepId) => {
        const { activeTourId, activeStepIndex } = get();
        if (activeTourId !== tourId) return;

        const tour = TOUR_REGISTRY[activeTourId];
        if (!tour) return;

        const currentStep = tour.steps[activeStepIndex];
        if (!currentStep || currentStep.id !== stepId) return;

        track(ANALYTICS_EVENTS.TOUR_EVENT, {
          tour_id: tourId,
          action: "step_advanced",
          step_id: stepId,
          step_index: activeStepIndex,
          total_steps: tour.steps.length,
        });

        if (activeStepIndex >= tour.steps.length - 1) {
          set((state) => {
            if (!state.activeTourId) return state;
            return {
              completedTourIds: [...state.completedTourIds, state.activeTourId],
              activeTourId: null,
              activeStepIndex: 0,
            };
          });
          track(ANALYTICS_EVENTS.TOUR_EVENT, {
            tour_id: tourId,
            action: "completed",
            total_steps: tour.steps.length,
          });
        } else {
          set({ activeStepIndex: activeStepIndex + 1 });
        }
      },

      completeTour: (tourId) => {
        const { completedTourIds } = get();
        if (completedTourIds.includes(tourId)) return;
        const tour = TOUR_REGISTRY[tourId];
        set({
          completedTourIds: [...completedTourIds, tourId],
          activeTourId: null,
          activeStepIndex: 0,
        });
        track(ANALYTICS_EVENTS.TOUR_EVENT, {
          tour_id: tourId,
          action: "completed",
          total_steps: tour?.steps.length,
        });
      },

      dismiss: () => {
        const { activeTourId, activeStepIndex } = get();
        if (!activeTourId) return;
        const tour = TOUR_REGISTRY[activeTourId];
        track(ANALYTICS_EVENTS.TOUR_EVENT, {
          tour_id: activeTourId,
          action: "dismissed",
          step_id: tour?.steps[activeStepIndex]?.id,
          step_index: activeStepIndex,
          total_steps: tour?.steps.length,
        });
        set((state) => ({
          completedTourIds: [...state.completedTourIds, activeTourId],
          activeTourId: null,
          activeStepIndex: 0,
        }));
      },

      resetTours: () => {
        set({ completedTourIds: [], activeTourId: null, activeStepIndex: 0 });
      },
    }),
    {
      name: "tour-store",
      partialize: (state) => ({
        completedTourIds: state.completedTourIds,
      }),
      onRehydrateStorage: () => () => {
        const migrationKey = "tour-store-v1-migrated";
        if (localStorage.getItem(migrationKey)) return;
        localStorage.setItem(migrationKey, "1");

        const { hasCompletedOnboarding } = useOnboardingStore.getState();
        if (hasCompletedOnboarding) {
          useTourStore.getState().completeTour(createFirstTaskTour.id);
        }
      },
    },
  ),
);
