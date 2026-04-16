import { Check, Copy } from "@phosphor-icons/react";
import { IconButton } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

type CodeBlockSize = "1" | "1.5" | "2" | "3";

interface CodeBlockProps {
  children: ReactNode;
  size?: CodeBlockSize;
}

const sizeStyles: Record<
  CodeBlockSize,
  { fontSize: string; lineHeight: string }
> = {
  "1": {
    fontSize: "var(--font-size-1)",
    lineHeight: "var(--line-height-1)",
  },
  "1.5": {
    fontSize: "var(--font-size-1-5)",
    lineHeight: "var(--line-height-1-5)",
  },
  "2": {
    fontSize: "var(--font-size-2)",
    lineHeight: "var(--line-height-2)",
  },
  "3": {
    fontSize: "var(--font-size-3)",
    lineHeight: "var(--line-height-3)",
  },
};

function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractText(
      (children as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
}

export function CodeBlock({ children, size = "1" }: CodeBlockProps) {
  const styles = sizeStyles[size];
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = extractText(children);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="group" style={{ position: "relative" }}>
      <pre
        style={{
          margin: 0,
          marginBottom: "var(--space-3)",
          padding: "var(--space-3)",
          paddingRight: "var(--space-7)",
          backgroundColor: "var(--gray-2)",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--gray-4)",
          fontFamily: "var(--code-font-family)",
          fontSize: styles.fontSize,
          lineHeight: styles.lineHeight,
          color: "var(--gray-12)",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {children}
      </pre>
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "var(--space-1)",
          right: "var(--space-1)",
          opacity: 0,
          transition: "opacity 0.15s",
          cursor: "pointer",
        }}
        className="group-hover:!opacity-100 [&]:hover:!opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </IconButton>
    </div>
  );
}
