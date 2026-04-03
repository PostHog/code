import {
  baseComponents,
  defaultRemarkPlugins,
} from "@features/editor/components/MarkdownRenderer";
import { File, GithubLogo, Warning } from "@phosphor-icons/react";
import { Code, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const MENTION_TAG_REGEX =
  /<file\s+path="([^"]+)"\s*\/>|<github_issue\s+number="([^"]+)"(?:\s+title="([^"]*)")?(?:\s+url="([^"]*)")?\s*\/>|<error_context\s+label="([^"]*)">[\s\S]*?<\/error_context>/g;
const MENTION_TAG_TEST =
  /<(?:file\s+path|github_issue\s+number|error_context\s+label)="[^"]+"/;

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

export function hasMentionTags(content: string): boolean {
  return MENTION_TAG_TEST.test(content);
}

export const hasFileMentions = hasMentionTags;

function MentionChip({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Code
      size="1"
      variant="soft"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        verticalAlign: "middle",
        margin: "0 2px",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {icon}
      {label}
    </Code>
  );
}

export function parseMentionTags(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MENTION_TAG_REGEX)) {
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      parts.push(
        <InlineMarkdown
          key={`text-${lastIndex}`}
          content={content.slice(lastIndex, matchIndex)}
        />,
      );
    }

    if (match[1]) {
      const filePath = match[1];
      const segments = filePath.split("/").filter(Boolean);
      const fileName = segments.pop() ?? filePath;
      const parentDir = segments.pop();
      const label = parentDir ? `${parentDir}/${fileName}` : fileName;
      parts.push(
        <MentionChip
          key={`file-${matchIndex}`}
          icon={<File size={12} />}
          label={label}
        />,
      );
    } else if (match[2]) {
      const issueNumber = match[2];
      const issueTitle = match[3];
      const issueUrl = match[4];
      const label = issueTitle
        ? `#${issueNumber} - ${issueTitle}`
        : `#${issueNumber}`;
      parts.push(
        <MentionChip
          key={`issue-${matchIndex}`}
          icon={<GithubLogo size={12} />}
          label={label}
          onClick={issueUrl ? () => window.open(issueUrl, "_blank") : undefined}
        />,
      );
    } else if (match[5]) {
      parts.push(
        <MentionChip
          key={`error-ctx-${matchIndex}`}
          icon={<Warning size={12} />}
          label={match[5]}
        />,
      );
    }

    lastIndex = matchIndex + match[0].length;
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

export const parseFileMentions = parseMentionTags;
