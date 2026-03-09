import {
  baseComponents,
  defaultRemarkPlugins,
} from "@features/editor/components/MarkdownRenderer";
import { File } from "@phosphor-icons/react";
import { Code, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const FILE_TAG_REGEX = /<file\s+path="([^"]+)"\s*\/>/g;
const FILE_TAG_TEST = /<file\s+path="[^"]+"\s*\/>/;

/**
 * Markdown components that render paragraphs as inline spans so that
 * text chunks between file mentions stay on the same line.
 */
const inlineComponents: Components = {
  ...baseComponents,
  p: ({ children }) => (
    <Text as="span" size="1" color="gray" highContrast>
      {children}
    </Text>
  ),
};

export const InlineMarkdown = memo(function InlineMarkdown({
  content,
}: {
  content: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={defaultRemarkPlugins}
      components={inlineComponents}
    >
      {content}
    </ReactMarkdown>
  );
});

export function hasFileMentions(content: string): boolean {
  return FILE_TAG_TEST.test(content);
}

export function parseFileMentions(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(FILE_TAG_REGEX)) {
    if (match.index !== undefined && match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <InlineMarkdown key={`text-${lastIndex}`} content={textBefore} />,
      );
    }

    const filePath = match[1];
    const fileName = filePath.split("/").pop() ?? filePath;
    parts.push(
      <Code
        key={`file-${match.index}`}
        size="1"
        variant="soft"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          verticalAlign: "middle",
          margin: "0 6px",
        }}
      >
        <File size={12} />
        {fileName}
      </Code>,
    );

    lastIndex = (match.index ?? 0) + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <InlineMarkdown
        key={`text-${lastIndex}`}
        content={content.slice(lastIndex)}
      />,
    );
  }

  return parts;
}
