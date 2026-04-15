export type TourStepAdvance = { type: "action" } | { type: "click" };

export interface TourStep {
  id: string;
  target: string;
  hogSrc: string;
  message: string;
  advanceOn: TourStepAdvance;
}

export interface TourDefinition {
  id: string;
  steps: TourStep[];
}
