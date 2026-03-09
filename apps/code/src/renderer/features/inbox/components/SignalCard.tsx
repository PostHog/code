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

interface GitHubLabelObject {
  name: string;
  color?: string;
}

interface GitHubIssueExtra {
  html_url?: string;
  number?: number;
  state?: string;
  labels?: string | GitHubLabelObject[];
  created_at?: string;
  updated_at?: string;
  locked?: boolean;
}

function resolveLabels(
  raw: GitHubIssueExtra["labels"],
): { name: string; color?: string }[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((l: string | GitHubLabelObject) =>
          typeof l === "string"
            ? { name: l }
            : { name: l.name, color: l.color },
        );
      }
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((l) =>
      typeof l === "string" ? { name: l } : { name: l.name, color: l.color },
    );
  }
  return [];
}

function splitTitleBody(content: string): { title: string; body: string } {
  const firstNewline = content.indexOf("\n");
  if (firstNewline === -1) return { title: content, body: "" };
  return {
    title: content.slice(0, firstNewline).trim(),
    body: content
      .slice(firstNewline + 1)
      .replace(/^[\n]+/, "")
      .trim(),
  };
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
        className="whitespace-pre-wrap text-pretty break-words font-mono text-[10px] leading-relaxed"
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

function parseExtra(raw: Record<string, unknown>): GitHubIssueExtra {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GitHubIssueExtra;
    } catch {
      return {};
    }
  }
  return raw as GitHubIssueExtra;
}

function GitHubIssueSignalCard({ signal }: SignalCardProps) {
  const extra = parseExtra(signal.extra);
  const labels = resolveLabels(extra.labels);
  const issueUrl = extra.html_url ?? null;
  const issueNumber = extra.number ?? null;
  const { title, body } = splitTitleBody(signal.content);

  const titleContent = (
    <>
      {issueNumber ? `#${issueNumber} ` : ""}
      {title}
    </>
  );

  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      <Flex
        align="start"
        gap="2"
        px="3"
        py="2"
        className="min-w-0 border-gray-5 border-b bg-gray-2"
      >
        <GithubLogoIcon size={14} className="mt-0.5 shrink-0 text-gray-11" />
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 break-words font-medium font-mono text-[11px] text-gray-12 hover:text-accent-11"
          >
            {titleContent}
          </a>
        ) : (
          <Text
            size="1"
            weight="medium"
            className="min-w-0 flex-1 break-words font-mono text-[11px]"
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

      <Flex direction="column" gap="2" px="3" py="2" className="min-w-0">
        {labels.length > 0 && (
          <Flex align="center" gap="1" wrap="wrap">
            <TagIcon size={11} className="shrink-0 text-gray-9" />
            {labels.map((label) => (
              <span
                key={label.name}
                className="inline-flex items-center rounded-full px-1.5 py-0.5 font-medium font-mono text-[10px]"
                style={
                  label.color
                    ? {
                        backgroundColor: `#${label.color}20`,
                        color: `#${label.color}`,
                        border: `1px solid #${label.color}40`,
                      }
                    : {
                        backgroundColor: "var(--gray-3)",
                        color: "var(--gray-11)",
                        border: "1px solid var(--gray-6)",
                      }
                }
              >
                {label.name}
              </span>
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
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        className="min-w-0 border-gray-5 border-b bg-gray-2"
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

      <Flex direction="column" gap="2" px="3" py="2" className="min-w-0">
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
