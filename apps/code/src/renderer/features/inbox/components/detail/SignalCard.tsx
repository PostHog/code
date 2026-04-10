import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { SOURCE_PRODUCT_META } from "@features/inbox/components/utils/source-product-icons";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  QuestionIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { Signal, SignalFindingContent } from "@shared/types";
import { useState } from "react";

const COLLAPSE_THRESHOLD = 300;

// ── Source line labels (matching PostHog Cloud's signalCardSourceLine) ────────

const ERROR_TRACKING_TYPE_LABELS: Record<string, string> = {
  issue_created: "New issue",
  issue_reopened: "Issue reopened",
  issue_spiking: "Volume spike",
};

function signalCardSourceLine(signal: {
  source_product: string;
  source_type: string;
}): string {
  const { source_product, source_type } = signal;

  if (source_product === "error_tracking") {
    const typeLabel =
      ERROR_TRACKING_TYPE_LABELS[source_type] ?? source_type.replace(/_/g, " ");
    return `Error tracking · ${typeLabel}`;
  }
  if (
    source_product === "session_replay" &&
    source_type === "session_segment_cluster"
  ) {
    return "Session replay · Session segment cluster";
  }
  if (
    source_product === "session_replay" &&
    source_type === "session_analysis_cluster"
  ) {
    return "Session replay · Session analysis cluster";
  }
  if (source_product === "llm_analytics" && source_type === "evaluation") {
    return "LLM analytics · Evaluation";
  }
  if (source_product === "zendesk" && source_type === "ticket") {
    return "Zendesk · Ticket";
  }
  if (source_product === "github" && source_type === "issue") {
    return "GitHub · Issue";
  }
  if (source_product === "linear" && source_type === "issue") {
    return "Linear · Issue";
  }

  const productLabel = source_product.replace(/_/g, " ");
  const typeLabel = source_type.replace(/_/g, " ");
  return `${productLabel} · ${typeLabel}`;
}

// ── Shared utilities ─────────────────────────────────────────────────────────

interface GitHubLabelObject {
  name: string;
  color?: string;
}

interface GitHubIssueExtra {
  html_url?: string;
  number?: number;
  labels?: string | GitHubLabelObject[];
  created_at?: string;
}

interface ZendeskTicketExtra {
  url?: string;
  priority?: string;
  status?: string;
  tags?: string[];
}

interface LlmEvalExtra {
  evaluation_id?: string;
  trace_id?: string;
  model?: string;
  provider?: string;
}

interface ErrorTrackingExtra {
  fingerprint?: string;
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

function truncateBody(body: string, maxLength = COLLAPSE_THRESHOLD): string {
  if (body.length <= maxLength) return body;
  const truncated = body.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > maxLength * 0.5 ? lastNewline : maxLength;
  let result = truncated.slice(0, cutPoint);
  // Close any open code fences so markdown renders cleanly
  const fenceCount = (result.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) {
    // Trim trailing partial fence line (e.g. just "```" with no content after)
    const lastFence = result.lastIndexOf("```");
    const afterFence = result.slice(lastFence + 3).trim();
    if (!afterFence) {
      result = result.slice(0, lastFence).trimEnd();
    } else {
      result += "\n```";
    }
  }
  return `${result}\n\n…`;
}

function parseExtra(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw;
}

// ── Type guards ──────────────────────────────────────────────────────────────

function isGithubIssueExtra(
  extra: Record<string, unknown>,
): extra is Record<string, unknown> & GitHubIssueExtra {
  return "html_url" in extra && "number" in extra;
}

function isZendeskTicketExtra(
  extra: Record<string, unknown>,
): extra is Record<string, unknown> & ZendeskTicketExtra {
  return "url" in extra && "priority" in extra;
}

function isLlmEvalExtra(
  extra: Record<string, unknown>,
): extra is Record<string, unknown> & LlmEvalExtra {
  return "evaluation_id" in extra && "trace_id" in extra;
}

function isErrorTrackingExtra(
  extra: Record<string, unknown>,
): extra is Record<string, unknown> & ErrorTrackingExtra {
  return typeof extra.fingerprint === "string";
}

// ── Shared components ────────────────────────────────────────────────────────

function VerificationBadge({ verified }: { verified: boolean }) {
  return (
    <Flex
      align="center"
      gap="1"
      className="shrink-0 text-[11px]"
      title={
        verified ? "Verified by code or data evidence" : "Could not be verified"
      }
      style={{ color: verified ? "var(--green-9)" : "var(--gray-9)" }}
    >
      {verified ? (
        <CheckCircleIcon size={12} weight="fill" />
      ) : (
        <QuestionIcon size={12} weight="bold" />
      )}
      <span>{verified ? "Verified" : "Unverified"}</span>
    </Flex>
  );
}

function SignalCardHeader({
  signal,
  verified,
}: {
  signal: Signal;
  verified?: boolean;
}) {
  const meta = SOURCE_PRODUCT_META[signal.source_product];

  return (
    <Flex align="center" gap="2" className="mb-2">
      <span
        className="shrink-0"
        style={{ color: meta?.color ?? "var(--gray-9)" }}
      >
        {meta ? (
          <meta.Icon size={14} />
        ) : (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--gray-9)" }}
          />
        )}
      </span>
      <Text
        size="1"
        weight="medium"
        className="text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        {signalCardSourceLine(signal)}
      </Text>
      <span className="flex-1" />
      {verified !== undefined && <VerificationBadge verified={verified} />}
      <Badge
        variant="soft"
        color="gray"
        size="1"
        className="shrink-0 text-[11px]"
      >
        Weight: {signal.weight.toFixed(1)}
      </Badge>
    </Flex>
  );
}

function CollapsibleBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = body.length > COLLAPSE_THRESHOLD;
  // Preprocess content to handle escaped backticks and ensure proper markdown parsing
  const processedBody = body
    .replace(/\\`/g, "`") // Unescape escaped backticks
    .replace(/`([^`]+)`/g, "`$1`"); // Ensure proper backtick formatting
  const displayBody =
    isLong && !expanded ? truncateBody(processedBody) : processedBody;

  return (
    <Box>
      <Box
        className="text-pretty break-words text-[11px] leading-relaxed [&_code]:text-[10px] [&_p:last-child]:mb-0 [&_p]:mb-1 [&_pre]:text-[10px]"
        style={{ color: "var(--gray-11)" }}
      >
        <MarkdownRenderer content={displayBody} />
      </Box>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 rounded px-1 py-0.5 font-medium text-[12px] text-accent-11 hover:bg-accent-3 hover:text-accent-12"
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

// ── Source-specific cards ────────────────────────────────────────────────────

function GitHubIssueSignalCard({
  signal,
  extra,
  verified,
  codePaths,
  dataQueried,
}: {
  signal: Signal;
  extra: GitHubIssueExtra;
  verified?: boolean;
  codePaths?: string[];
  dataQueried?: string;
}) {
  const labels = resolveLabels(extra.labels);
  const issueUrl = extra.html_url ?? null;

  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} verified={verified} />
      <CollapsibleBody body={signal.content} />
      <Flex
        align="center"
        gap="2"
        wrap="wrap"
        mt="2"
        className="text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        <Text weight="medium" className="text-[11px]">
          #{extra.number}
        </Text>
        {labels.map((label) => (
          <span
            key={label.name}
            className="inline-flex items-center rounded-full px-1.5 py-0.5 font-medium text-[11px]"
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
            <TagIcon size={10} className="mr-0.5" />
            {label.name}
          </span>
        ))}
        <span className="flex-1" />
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-gray-10 hover:text-gray-12"
          >
            View on GitHub
            <ArrowSquareOutIcon size={12} />
          </a>
        )}
      </Flex>
      {extra.created_at && (
        <Text
          size="1"
          className="mt-1 block text-[11px]"
          style={{ color: "var(--gray-10)" }}
        >
          Opened: {new Date(extra.created_at).toLocaleString()}
        </Text>
      )}
      <CodePathsCollapsible paths={codePaths ?? []} />
      <DataQueriedCollapsible text={dataQueried ?? ""} />
    </Box>
  );
}

function ZendeskTicketSignalCard({
  signal,
  extra,
  verified,
  codePaths,
  dataQueried,
}: {
  signal: Signal;
  extra: ZendeskTicketExtra;
  verified?: boolean;
  codePaths?: string[];
  dataQueried?: string;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} verified={verified} />
      <CollapsibleBody body={signal.content} />
      <Flex
        align="center"
        gap="2"
        wrap="wrap"
        mt="2"
        className="text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        {extra.priority && (
          <Badge variant="soft" color="gray" size="1" className="text-[11px]">
            Priority: {extra.priority}
          </Badge>
        )}
        {extra.status && (
          <Badge variant="soft" color="gray" size="1" className="text-[11px]">
            Status: {extra.status}
          </Badge>
        )}
        {extra.tags?.map((tag) => (
          <Badge
            key={tag}
            variant="soft"
            color="gray"
            size="1"
            className="text-[11px]"
          >
            {tag}
          </Badge>
        ))}
        <span className="flex-1" />
        {extra.url && (
          <a
            href={extra.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-gray-10 hover:text-gray-12"
          >
            Open
            <ArrowSquareOutIcon size={12} />
          </a>
        )}
      </Flex>
      <CodePathsCollapsible paths={codePaths ?? []} />
      <DataQueriedCollapsible text={dataQueried ?? ""} />
    </Box>
  );
}

function LlmEvalSignalCard({
  signal,
  extra,
  verified,
  codePaths,
  dataQueried,
}: {
  signal: Signal;
  extra: LlmEvalExtra;
  verified?: boolean;
  codePaths?: string[];
  dataQueried?: string;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} verified={verified} />
      <CollapsibleBody body={signal.content} />
      <Flex
        align="center"
        gap="2"
        mt="2"
        className="text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        {extra.model && <span>Model: {extra.model}</span>}
        {extra.model && extra.provider && <span>·</span>}
        {extra.provider && <span>Provider: {extra.provider}</span>}
      </Flex>
      {extra.trace_id && (
        <Text
          size="1"
          className="mt-1 block text-[11px]"
          style={{ color: "var(--gray-10)" }}
        >
          Trace:{" "}
          <span className="font-mono">{extra.trace_id.slice(0, 12)}...</span>
        </Text>
      )}
      <CodePathsCollapsible paths={codePaths ?? []} />
      <DataQueriedCollapsible text={dataQueried ?? ""} />
    </Box>
  );
}

function ErrorTrackingSignalCard({
  signal,
  verified,
  codePaths,
  dataQueried,
}: {
  signal: Signal;
  verified?: boolean;
  codePaths?: string[];
  dataQueried?: string;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} verified={verified} />
      <CollapsibleBody body={signal.content} />
      <CodePathsCollapsible paths={codePaths ?? []} />
      <DataQueriedCollapsible text={dataQueried ?? ""} />
    </Box>
  );
}

function GenericSignalCard({
  signal,
  verified,
  codePaths,
  dataQueried,
}: {
  signal: Signal;
  verified?: boolean;
  codePaths?: string[];
  dataQueried?: string;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} verified={verified} />
      <CollapsibleBody body={signal.content} />
      <Text
        size="1"
        className="mt-2 block text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        {new Date(signal.timestamp).toLocaleString()}
      </Text>
      <CodePathsCollapsible paths={codePaths ?? []} />
      <DataQueriedCollapsible text={dataQueried ?? ""} />
    </Box>
  );
}

function CodePathsCollapsible({ paths }: { paths: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (paths.length === 0) return null;

  return (
    <Box mt="2" style={{ borderTop: "1px solid var(--gray-5)" }} pt="2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 rounded px-1 py-0.5 font-medium text-[11px] text-gray-10 hover:bg-gray-3 hover:text-gray-12"
      >
        {expanded ? <CaretDownIcon size={10} /> : <CaretRightIcon size={10} />}
        Relevant code ({paths.length})
      </button>
      {expanded && (
        <Flex direction="column" gap="1" mt="1" className="pl-[18px]">
          {paths.map((raw) => {
            const trimmed = raw.trim();
            const parenIdx = trimmed.indexOf(" (");
            const filePath =
              parenIdx >= 0 ? trimmed.slice(0, parenIdx) : trimmed;
            const comment = parenIdx >= 0 ? trimmed.slice(parenIdx + 1) : null;
            return (
              <Text key={raw} size="1" className="text-[11px]">
                <span className="font-mono" style={{ color: "var(--gray-12)" }}>
                  {filePath}
                </span>
                {comment && (
                  <span className="ml-1" style={{ color: "var(--gray-9)" }}>
                    {comment}
                  </span>
                )}
              </Text>
            );
          })}
        </Flex>
      )}
    </Box>
  );
}

function DataQueriedCollapsible({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <Box mt="2" style={{ borderTop: "1px solid var(--gray-5)" }} pt="2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 rounded px-1 py-0.5 font-medium text-[11px] text-gray-10 hover:bg-gray-3 hover:text-gray-12"
      >
        {expanded ? <CaretDownIcon size={10} /> : <CaretRightIcon size={10} />}
        Data queried
      </button>
      {expanded && (
        <Text
          size="1"
          color="gray"
          className="mt-1 block whitespace-pre-wrap text-pretty pl-[18px] text-[11px] leading-relaxed"
        >
          {text}
        </Text>
      )}
    </Box>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function SignalCard({
  signal,
  finding,
}: {
  signal: Signal;
  finding?: SignalFindingContent;
}) {
  const extra = parseExtra(signal.extra);
  const verified = finding?.verified;
  const codePaths = finding?.relevant_code_paths ?? [];
  const dataQueried = finding?.data_queried ?? "";

  if (
    signal.source_product === "error_tracking" &&
    isErrorTrackingExtra(extra)
  ) {
    return (
      <ErrorTrackingSignalCard
        signal={signal}
        verified={verified}
        codePaths={codePaths}
        dataQueried={dataQueried}
      />
    );
  }
  if (signal.source_product === "github" && isGithubIssueExtra(extra)) {
    return (
      <GitHubIssueSignalCard
        signal={signal}
        extra={extra}
        verified={verified}
        codePaths={codePaths}
        dataQueried={dataQueried}
      />
    );
  }
  if (signal.source_product === "zendesk" && isZendeskTicketExtra(extra)) {
    return (
      <ZendeskTicketSignalCard
        signal={signal}
        extra={extra}
        verified={verified}
        codePaths={codePaths}
        dataQueried={dataQueried}
      />
    );
  }
  if (signal.source_product === "llm_analytics" && isLlmEvalExtra(extra)) {
    return (
      <LlmEvalSignalCard
        signal={signal}
        extra={extra}
        verified={verified}
        codePaths={codePaths}
        dataQueried={dataQueried}
      />
    );
  }
  return (
    <GenericSignalCard
      signal={signal}
      verified={verified}
      codePaths={codePaths}
    />
  );
}
