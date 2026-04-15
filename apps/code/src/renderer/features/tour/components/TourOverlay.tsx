import { useEffect, useRef } from "react";
import { useElementRect } from "../hooks/useElementRect";
import { useTourStore } from "../stores/tourStore";
import { TOUR_REGISTRY } from "../tours/tourRegistry";
import { TourTooltip } from "./TourTooltip";

export function TourOverlay() {
  const activeTourId = useTourStore((s) => s.activeTourId);
  const activeStepIndex = useTourStore((s) => s.activeStepIndex);
  const advance = useTourStore((s) => s.advance);
  const dismiss = useTourStore((s) => s.dismiss);

  const tour = activeTourId ? TOUR_REGISTRY[activeTourId] : null;
  const step = tour?.steps[activeStepIndex] ?? null;

  const selector = step ? `[data-tour="${step.target}"]` : null;
  const targetRect = useElementRect(selector);

  const advancedRef = useRef(false);

  useEffect(() => {
    advancedRef.current = false;
  }, []);

  useEffect(() => {
    if (!step || step.advanceOn.type !== "click" || !selector) return;

    const el = document.querySelector(selector);
    if (!el) return;

    const handler = () => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        setTimeout(advance, 0);
      }
    };

    el.addEventListener("click", handler, { capture: true });
    return () => el.removeEventListener("click", handler, { capture: true });
  }, [step, selector, advance]);

  useEffect(() => {
    if (!step || step.advanceOn.type !== "action" || !selector) return;

    let frameId: number;

    const poll = () => {
      const el = document.querySelector(selector);
      if (el?.getAttribute("data-tour-ready") === "true") {
        if (!advancedRef.current) {
          advancedRef.current = true;
          advance();
        }
        return;
      }
      frameId = requestAnimationFrame(poll);
    };

    frameId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frameId);
  }, [step, selector, advance]);

  if (!tour || !step || !targetRect) return null;

  return (
    <TourTooltip
      step={step}
      stepNumber={activeStepIndex + 1}
      totalSteps={tour.steps.length}
      targetRect={targetRect}
      onDismiss={dismiss}
    />
  );
}
