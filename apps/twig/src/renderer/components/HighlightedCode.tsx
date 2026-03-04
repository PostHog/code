import { highlightSyntax } from "@renderer/lib/syntax-highlight";
import { useThemeStore } from "@stores/themeStore";
import { useMemo } from "react";

interface HighlightedCodeProps {
  code: string;
  language: string;
}

export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const segments = useMemo(
    () => highlightSyntax(code, language, isDarkMode),
    [code, language, isDarkMode],
  );

  if (!segments) {
    return <code>{code}</code>;
  }

  return (
    <code>
      {segments.map((segment, i) =>
        segment.color ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable parse output, never reorders
          <span key={i} style={{ color: segment.color }}>
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </code>
  );
}
