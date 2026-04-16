import { type ReactNode, useEffect, useRef, useState } from "react";

const VISIBILITY_MARGIN = 1500;

interface LazyDiffProps {
  children: ReactNode;
}

export function LazyDiff({ children }: LazyDiffProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || mounted) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${VISIBILITY_MARGIN}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  return <div ref={ref}>{mounted ? children : null}</div>;
}
