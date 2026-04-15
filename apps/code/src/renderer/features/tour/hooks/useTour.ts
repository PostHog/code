import { useTourStore } from "../stores/tourStore";

export function useTour() {
  const startTour = useTourStore((s) => s.startTour);
  const dismiss = useTourStore((s) => s.dismiss);
  const completedTourIds = useTourStore((s) => s.completedTourIds);

  return {
    startTour,
    dismiss,
    isCompleted: (tourId: string) => completedTourIds.includes(tourId),
  };
}
