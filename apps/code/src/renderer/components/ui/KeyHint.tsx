import { Kbd } from "@posthog/quill";
import type React from "react";

interface KeyHintProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function KeyHint({ children, className, style }: KeyHintProps) {
  return (
    <Kbd
      className={`text-[11px] ${className ?? ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "inherit",
        color: "var(--gray-11)",
        ...style,
      }}
    >
      {children as string}
    </Kbd>
  );
}
