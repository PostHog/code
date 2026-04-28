import type { TourDefinition } from "../types";
import { createFirstTaskTour } from "./createFirstTaskTour";

export const TOUR_REGISTRY: Record<string, TourDefinition> = {
  [createFirstTaskTour.id]: createFirstTaskTour,
};
