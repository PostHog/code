import { useId } from "react";

const DOT_FILL = "var(--gray-6)";

interface DotPatternBackgroundProps {
  style?: React.CSSProperties;
}

export function DotPatternBackground({ style }: DotPatternBackgroundProps) {
  const patternId = useId();

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.4,
        maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 100%)",
        ...style,
      }}
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
        >
          <circle cx="0" cy="0" r="1" fill={DOT_FILL} />
          <circle cx="0" cy="8" r="1" fill={DOT_FILL} />
          <circle cx="8" cy="8" r="1" fill={DOT_FILL} />
          <circle cx="8" cy="0" r="1" fill={DOT_FILL} />
          <circle cx="4" cy="4" r="1" fill={DOT_FILL} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
