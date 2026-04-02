import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import {
  ArrowSquareOutIcon,
  BrainIcon,
  BugIcon,
  CaretDownIcon,
  CaretRightIcon,
  GithubLogoIcon,
  KanbanIcon,
  TagIcon,
  TicketIcon,
  VideoIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { Signal } from "@shared/types";
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

// ── Source product color (matching Cloud's known product colors) ──────────────

const SOURCE_PRODUCT_ICONS: Record<
  string,
  { icon: React.ReactNode; color: string }
> = {
  session_replay: { icon: <VideoIcon size={14} />, color: "var(--amber-9)" },
  error_tracking: { icon: <BugIcon size={14} />, color: "var(--red-9)" },
  llm_analytics: { icon: <BrainIcon size={14} />, color: "var(--purple-9)" },
  github: { icon: <GithubLogoIcon size={14} />, color: "var(--gray-11)" },
  linear: { icon: <KanbanIcon size={14} />, color: "var(--blue-9)" },
  zendesk: { icon: <TicketIcon size={14} />, color: "var(--green-9)" },
};

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

function SignalCardHeader({ signal }: { signal: Signal }) {
  const productInfo = SOURCE_PRODUCT_ICONS[signal.source_product];

  return (
    <Flex align="center" gap="2" className="mb-2">
      <span
        className="shrink-0"
        style={{ color: productInfo?.color ?? "var(--gray-9)" }}
      >
        {productInfo?.icon ?? (
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
  const displayBody = isLong && !expanded ? truncateBody(body) : body;

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
}: {
  signal: Signal;
  extra: GitHubIssueExtra;
}) {
  const labels = resolveLabels(extra.labels);
  const issueUrl = extra.html_url ?? null;

  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} />
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
    </Box>
  );
}

function ZendeskTicketSignalCard({
  signal,
  extra,
}: {
  signal: Signal;
  extra: ZendeskTicketExtra;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} />
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
    </Box>
  );
}

function LlmEvalSignalCard({
  signal,
  extra,
}: {
  signal: Signal;
  extra: LlmEvalExtra;
}) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} />
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
    </Box>
  );
}

function ErrorTrackingSignalCard({
  signal,
  extra,
}: {
  signal: Signal;
  extra: ErrorTrackingExtra;
}) {
  const fingerprint = extra.fingerprint ?? "";

  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} />
      <CollapsibleBody body={signal.content} />
      <Flex
        align="center"
        gap="2"
        wrap="wrap"
        mt="2"
        className="text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        <Flex align="center" gap="1">
          <WarningIcon
            size={14}
            weight="bold"
            className="shrink-0"
            style={{ color: "var(--amber-9)" }}
          />
          <span>
            Fingerprint{" "}
            <span
              className="break-all font-mono"
              style={{ color: "var(--gray-12)" }}
            >
              {fingerprint}
            </span>
          </span>
        </Flex>
        <span className="flex-1" />
        {/* No "View issue" link in Code — error tracking lives in Cloud */}
      </Flex>
    </Box>
  );
}

function GenericSignalCard({ signal }: { signal: Signal }) {
  return (
    <Box className="min-w-0 overflow-hidden rounded-lg border border-gray-6 bg-gray-1 p-3">
      <SignalCardHeader signal={signal} />
      <CollapsibleBody body={signal.content} />
      <Text
        size="1"
        className="mt-2 block text-[11px]"
        style={{ color: "var(--gray-10)" }}
      >
        {new Date(signal.timestamp).toLocaleString()}
      </Text>
    </Box>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function SignalCard({ signal }: { signal: Signal }) {
  const extra = parseExtra(signal.extra);

  if (
    signal.source_product === "error_tracking" &&
    isErrorTrackingExtra(extra)
  ) {
    return <ErrorTrackingSignalCard signal={signal} extra={extra} />;
  }
  if (signal.source_product === "github" && isGithubIssueExtra(extra)) {
    return <GitHubIssueSignalCard signal={signal} extra={extra} />;
  }
  if (signal.source_product === "zendesk" && isZendeskTicketExtra(extra)) {
    return <ZendeskTicketSignalCard signal={signal} extra={extra} />;
  }
  if (signal.source_product === "llm_analytics" && isLlmEvalExtra(extra)) {
    return <LlmEvalSignalCard signal={signal} extra={extra} />;
  }
  return <GenericSignalCard signal={signal} />;
}
