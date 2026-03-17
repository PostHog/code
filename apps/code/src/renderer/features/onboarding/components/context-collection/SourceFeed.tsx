import { Flex } from "@radix-ui/themes";
import type { SourceState } from "../../hooks/useContextCollection";

import { SourceSlot } from "./SourceSlot";

interface SourceFeedProps {
  sources: SourceState[];
}

export function SourceFeed({ sources }: SourceFeedProps) {
  return (
    <Flex direction="column" gap="2" style={{ width: "100%" }}>
      {sources.map((source) => (
        <SourceSlot key={source.config.id} source={source} />
      ))}
    </Flex>
  );
}
