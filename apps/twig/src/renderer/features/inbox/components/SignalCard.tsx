import {
  ArrowSquareOutIcon,
  BugIcon,
  CaretDownIcon,
  CaretRightIcon,
  GithubLogoIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { Signal } from "@shared/types";
import { useState } from "react";

const COLLAPSE_THRESHOLD = 300;

interface SignalCardProps {
  signal: Signal;
}

interface GitHubIssueExtra {
  url?: string;
  author?: string;
  labels?: string[];
  comments?: number;
  created_at?: string;
  updated_at?: string;
}

function extractIssueBody(content: string): string {
  const lines = content.split("\n");
  let bodyStart = 0;
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    if (
      lines[i].match(/^GitHub Issue #/) ||
      lines[i].match(/^Labels:\s/) ||
      lines[i].trim() === ""
    ) {
      bodyStart = i + 1;
    } else {
      break;
    }
  }
  return lines
    .slice(bodyStart)
    .join("\n")
    .replace(/^[\n]+/, "")
    .trim();
}

function truncateBody(body: string, maxLength = COLLAPSE_THRESHOLD): string {
  if (body.length <= maxLength) return body;
  const truncated = body.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > maxLength * 0.5 ? lastNewline : maxLength;
  return `${truncated.slice(0, cutPoint)}…`;
}

function CollapsibleBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = body.length > COLLAPSE_THRESHOLD;

  return (
    <Box>
      <Text
        size="1"
        color="gray"
        className="whitespace-pre-wrap text-pretty font-mono text-[10px] leading-relaxed"
      >
        {isLong && !expanded ? truncateBody(body) : body}
      </Text>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 rounded px-1 py-0.5 font-medium font-mono text-[11px] text-accent-11 hover:bg-accent-3 hover:text-accent-12"
        >
          {expanded ? (
            <CaretDownIcon size={12} />
          ) : (
            <CaretRightIcon size={12} />
          )}
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </Box>
  );
}

function GitHubIssueSignalCard({ signal }: SignalCardProps) {
  const extra = signal.extra as GitHubIssueExtra;
  const labels = extra.labels ?? [];
  const issueUrl = extra.url ?? null;
  const issueNumber =
    signal.source_id.match(/#(\d+)$/)?.[1] ??
    signal.content.match(/^GitHub Issue #(\d+)/)?.[1] ??
    null;
  const title =
    signal.content.match(/^GitHub Issue #\d+:\s*(.+)$/m)?.[1]?.trim() ??
    signal.content.slice(0, 80);
  const body = extractIssueBody(signal.content);

  const titleContent = (
    <>
      {issueNumber ? `#${issueNumber}` : ""} {title}
    </>
  );

  return (
    <Box className="overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        className="border-gray-5 border-b bg-gray-2"
      >
        <GithubLogoIcon size={14} className="shrink-0 text-gray-11" />
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate font-medium font-mono text-[11px] text-gray-12 hover:text-accent-11"
          >
            {titleContent}
          </a>
        ) : (
          <Text
            size="1"
            weight="medium"
            className="min-w-0 flex-1 truncate font-mono text-[11px]"
          >
            {titleContent}
          </Text>
        )}
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-gray-10 hover:text-gray-12"
          >
            <ArrowSquareOutIcon size={12} />
          </a>
        )}
      </Flex>

      <Flex direction="column" gap="2" px="3" py="2">
        {labels.length > 0 && (
          <Flex align="center" gap="1" wrap="wrap">
            <TagIcon size={11} className="shrink-0 text-gray-9" />
            {labels.map((label) => (
              <Badge
                key={label}
                variant="soft"
                color={label === "bug" ? "red" : "gray"}
                size="1"
                className="text-[10px]"
              >
                {label}
              </Badge>
            ))}
          </Flex>
        )}

        {body && <CollapsibleBody body={body} />}

        <Flex align="center" justify="between" gap="2">
          <Text size="1" color="gray" className="font-mono text-[10px]">
            w:{signal.weight.toFixed(2)}
          </Text>
          <Text size="1" color="gray" className="font-mono text-[10px]">
            {new Date(signal.timestamp).toLocaleString()}
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}

function DefaultSignalCard({ signal }: SignalCardProps) {
  return (
    <Box className="overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        className="border-gray-5 border-b bg-gray-2"
      >
        <BugIcon size={14} className="shrink-0 text-gray-11" />
        <Flex align="center" gap="1" className="min-w-0 flex-1" wrap="wrap">
          <Badge variant="soft" color="gray" size="1" className="text-[10px]">
            {signal.source_product}
          </Badge>
          <Badge variant="soft" color="gray" size="1" className="text-[10px]">
            {signal.source_type}
          </Badge>
        </Flex>
      </Flex>

      <Flex direction="column" gap="2" px="3" py="2">
        <CollapsibleBody body={signal.content} />

        <Flex align="center" justify="between" gap="2">
          <Text size="1" color="gray" className="font-mono text-[10px]">
            w:{signal.weight.toFixed(2)}
          </Text>
          <Text size="1" color="gray" className="font-mono text-[10px]">
            {new Date(signal.timestamp).toLocaleString()}
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}

export function SignalCard({ signal }: SignalCardProps) {
  if (signal.source_product === "github") {
    return <GitHubIssueSignalCard signal={signal} />;
  }
  return <DefaultSignalCard signal={signal} />;
}
