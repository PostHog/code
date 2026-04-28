import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { Box, Flex, Spinner, Text } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect, useRef, useState } from "react";

interface ProvisioningViewProps {
  taskId: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is required to strip ANSI sequences
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function processOutput(lines: string[], chunk: string): string[] {
  const next = [...lines];
  const parts = chunk.split("\n");

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const crSegments = part.split("\r");
    const lastSegment = crSegments[crSegments.length - 1];

    if (i === 0 && next.length > 0) {
      if (crSegments.length > 1) {
        next[next.length - 1] = lastSegment;
      } else {
        next[next.length - 1] += lastSegment;
      }
    } else {
      next.push(lastSegment);
    }
  }

  return next;
}

export function ProvisioningView({ taskId }: ProvisioningViewProps) {
  const trpc = useTRPC();
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLPreElement>(null);

  useSubscription(
    trpc.provisioning.onOutput.subscriptionOptions(undefined, {
      onData: (data) => {
        if (data.taskId !== taskId) return;
        setLines((prev) => processOutput(prev, stripAnsi(data.data)));
      },
    }),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return (
    <BackgroundWrapper>
      <Flex direction="column" height="100%" p="3" gap="2">
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text className="font-medium text-[13px]">
            Setting up worktree...
          </Text>
        </Flex>
        <Box className="min-h-0 flex-1 rounded-(--radius-2) border border-(--gray-a5) bg-(--color-surface)">
          <pre
            ref={scrollRef}
            className="m-0 h-full overflow-auto whitespace-pre-wrap break-all p-2 font-[var(--code-font-family)] text-(--gray-12) text-[13px]"
          >
            {lines.join("\n")}
          </pre>
        </Box>
      </Flex>
    </BackgroundWrapper>
  );
}
