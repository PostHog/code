import { Box, Button, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ToolViewProps } from "./toolCallUtils";
import { useToolCallStatus } from "./toolCallUtils";

interface ClarificationQuestion {
  id: string;
  question: string;
  prefilledAnswer: string;
  kind: "text" | "select";
  options?: string[];
}

interface ClarificationInput {
  questions: ClarificationQuestion[];
  roundIndex: number;
  roundsTotal: number;
}

function isClarificationInput(value: unknown): value is ClarificationInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ClarificationInput>;
  return (
    Array.isArray(v.questions) &&
    typeof v.roundIndex === "number" &&
    typeof v.roundsTotal === "number"
  );
}

/**
 * Renders the agent's clarification request — one form per question with the
 * prefilled best-guess populated. Submit resolves the in-flight MCP tool call
 * via `posthogCodeMcp.resolveClarification`. A separate "Stop and start
 * scaffolding" button submits with `stop: true` and the prefilled defaults.
 *
 * The `requestId` is encoded as the tool call ID itself; the main-process
 * MCP service is the source of truth for that mapping.
 */
export function ClarificationBlock({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const { isComplete, wasCancelled } = useToolCallStatus(
    toolCall.status,
    turnCancelled,
    turnComplete,
  );

  const trpcReact = useTRPC();
  const resolveMutation = useMutation(
    trpcReact.posthogCodeMcp.resolveClarification.mutationOptions(),
  );

  const input = useMemo<ClarificationInput | null>(() => {
    return isClarificationInput(toolCall.rawInput) ? toolCall.rawInput : null;
  }, [toolCall.rawInput]);

  // Stable initial state derived from the prefilled answers.
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!input) return {};
    const out: Record<string, string> = {};
    for (const q of input.questions) {
      out[q.id] = q.prefilledAnswer;
    }
    return out;
  });

  if (!input) {
    return (
      <Box className="my-2 max-w-4xl rounded-lg border border-(--gray-6) bg-(--gray-1) px-3 py-2">
        <Text className="text-(--gray-10) text-[13px]">
          Awaiting clarification…
        </Text>
      </Box>
    );
  }

  const requestId = toolCall.toolCallId;
  const isResolved = isComplete || wasCancelled;

  const submit = (stop: boolean): void => {
    if (isResolved || resolveMutation.isPending) return;
    const submittedAnswers = input.questions.map((q) => ({
      id: q.id,
      answer: stop ? q.prefilledAnswer : (answers[q.id] ?? q.prefilledAnswer),
    }));
    resolveMutation.mutate({
      requestId,
      answers: submittedAnswers,
      stop,
    });
  };

  return (
    <Box className="my-2 max-w-4xl overflow-hidden rounded-lg border border-(--gray-6) bg-(--gray-1)">
      <Flex
        align="center"
        justify="between"
        className="border-(--gray-6) border-b px-3 py-2"
      >
        <Text className="font-medium text-(--gray-12) text-[13px]">
          Clarification questions
        </Text>
        <Text className="text-(--gray-10) text-[13px]">
          Round {input.roundIndex + 1} of {input.roundsTotal}
        </Text>
      </Flex>

      <Flex direction="column" gap="3" className="px-3 py-3">
        {input.questions.map((q) => (
          <Flex key={q.id} direction="column" gap="1">
            <Text className="text-(--gray-12) text-[13px]">{q.question}</Text>
            {q.kind === "select" && q.options && q.options.length > 0 ? (
              <Select.Root
                value={answers[q.id] ?? q.prefilledAnswer}
                onValueChange={(value) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: value }))
                }
                disabled={isResolved || resolveMutation.isPending}
                size="2"
              >
                <Select.Trigger />
                <Select.Content>
                  {q.options.map((opt) => (
                    <Select.Item key={opt} value={opt}>
                      {opt}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            ) : (
              <TextField.Root
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [q.id]: e.target.value,
                  }))
                }
                disabled={isResolved || resolveMutation.isPending}
                placeholder={q.prefilledAnswer}
                size="2"
              />
            )}
          </Flex>
        ))}
      </Flex>

      {!isResolved && (
        <Flex
          align="center"
          justify="end"
          gap="2"
          className="border-(--gray-6) border-t px-3 py-2"
        >
          <Button
            type="button"
            variant="soft"
            color="gray"
            onClick={() => submit(true)}
            disabled={resolveMutation.isPending}
          >
            Stop and start scaffolding
          </Button>
          <Button
            type="button"
            onClick={() => submit(false)}
            disabled={resolveMutation.isPending}
          >
            Submit answers
          </Button>
        </Flex>
      )}

      {wasCancelled && (
        <Box className="border-(--gray-6) border-t px-3 py-2">
          <Text className="text-(--gray-10) text-[13px]">(Cancelled)</Text>
        </Box>
      )}
    </Box>
  );
}
