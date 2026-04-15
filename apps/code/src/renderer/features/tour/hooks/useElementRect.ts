import { useEffect, useState } from "react";

function rectsEqual(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

export function useElementRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let frameId: number;
    let prevRect: DOMRect | null = null;

    const poll = () => {
      const el = document.querySelector(selector);
      const nextRect = el?.getBoundingClientRect() ?? null;

      if (!rectsEqual(nextRect, prevRect)) {
        prevRect = nextRect;
        setRect(nextRect ? DOMRect.fromRect(nextRect) : null);
      }

      frameId = requestAnimationFrame(poll);
    };

    frameId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frameId);
  }, [selector]);

  return rect;
}
