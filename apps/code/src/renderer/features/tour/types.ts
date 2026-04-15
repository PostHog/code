export type CaretDirection = "top" | "right" | "bottom" | "left";

export type TourStepAdvance = { type: "action" } | { type: "click" };

export interface TourStep {
  id: string;
  target: string;
  caretDirection: CaretDirection;
  hogSrc: string;
  message: string;
  advanceOn: TourStepAdvance;
}

export interface TourDefinition {
  id: string;
  steps: TourStep[];
}
