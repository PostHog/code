import { Brain, Circle } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

const THINKING_MESSAGES = [
  "Booping",
  "Crunching",
  "Digging",
  "Fetching",
  "Inferring",
  "Indexing",
  "Juggling",
  "Noodling",
  "Peeking",
  "Percolating",
  "Poking",
  "Pondering",
  "Scanning",
  "Scrambling",
  "Sifting",
  "Sniffing",
  "Spelunking",
  "Tinkering",
  "Unraveling",
  "Decoding",
  "Trekking",
  "Sorting",
  "Trimming",
  "Mulling",
  "Surfacing",
  "Rummaging",
  "Scouting",
  "Scouring",
  "Threading",
  "Hunting",
  "Swizzling",
  "Grokking",
  "Hedging",
  "Scheming",
  "Unfurling",
  "Puzzling",
  "Dissecting",
  "Stacking",
  "Snuffling",
  "Hashing",
  "Clustering",
  "Teasing",
  "Cranking",
  "Merging",
  "Snooping",
  "Rewiring",
  "Bundling",
  "Linking",
  "Mapping",
  "Tickling",
  "Flicking",
  "Hopping",
  "Rolling",
  "Zipping",
  "Twisting",
  "Blooming",
  "Sparking",
  "Nesting",
  "Looping",
  "Wiring",
  "Snipping",
  "Zoning",
  "Tracing",
  "Warping",
  "Twinkling",
  "Flipping",
  "Priming",
  "Snagging",
  "Scuttling",
  "Framing",
  "Sharpening",
  "Flibbertigibbeting",
  "Kerfuffling",
  "Dithering",
  "Discombobulating",
  "Rambling",
  "Befuddling",
  "Waffling",
  "Muckling",
  "Hobnobbing",
  "Galumphing",
  "Puttering",
  "Whiffling",
  "Thinking",
];

function getRandomThinkingMessage(): string {
  return THINKING_MESSAGES[
    Math.floor(Math.random() * THINKING_MESSAGES.length)
  ];
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${secs}.${centiseconds.toString().padStart(2, "0")}s`;
}

interface GeneratingIndicatorProps {
  /** Timestamp (ms) when the prompt started. Only render this component while a prompt is pending. */
  startedAt?: number | null;
}

export function GeneratingIndicator({ startedAt }: GeneratingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [activity, setActivity] = useState(getRandomThinkingMessage);

  useEffect(() => {
    const startTime = startedAt ?? Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 50);

    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivity(getRandomThinkingMessage());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Flex
      align="center"
      gap="2"
      className="select-none text-accent-11"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <Brain size={12} className="ph-pulse" />
      <Text size="1">{activity}...</Text>
      <Text size="1" color="gray">
        (Esc to interrupt
      </Text>
      <Circle
        size={4}
        weight="fill"
        className="text-gray-9"
        style={{ margin: "0 2px" }}
      />
      <Text
        size="1"
        color="gray"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatDuration(elapsed)})
      </Text>
    </Flex>
  );
}
