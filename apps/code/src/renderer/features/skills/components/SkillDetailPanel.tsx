import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { ExternalAppsOpener } from "@features/task-detail/components/ExternalAppsOpener";
import { Folder, X } from "@phosphor-icons/react";
import { Badge, Box, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import type { SkillInfo } from "@shared/types/skills";
import { useQuery } from "@tanstack/react-query";
import { SOURCE_CONFIG } from "./SkillCard";

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  return match ? content.slice(match[0].length).trimStart() : content;
}

interface SkillDetailPanelProps {
  skill: SkillInfo;
  onClose: () => void;
}

export function SkillDetailPanel({ skill, onClose }: SkillDetailPanelProps) {
  const trpcReact = useTRPC();
  const config = SOURCE_CONFIG[skill.source];

  const skillMdPath = `${skill.path}/SKILL.md`;
  const { data: fileContent, isLoading } = useQuery(
    trpcReact.fs.readAbsoluteFile.queryOptions(
      { filePath: skillMdPath },
      { staleTime: 30_000 },
    ),
  );

  const body = fileContent ? stripFrontmatter(fileContent) : null;

  return (
    <>
      <Flex
        direction="column"
        gap="2"
        px="3"
        py="2"
        className="shrink-0"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex align="start" justify="between" gap="2">
          <Text
            size="1"
            weight="medium"
            className="block min-w-0 break-words text-[13px]"
          >
            {skill.name}
          </Text>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
          >
            <X size={14} />
          </button>
        </Flex>

        <Flex align="center" gap="2" wrap="wrap">
          <Badge size="1" variant="soft" color="gray">
            {config?.label ?? skill.source}
          </Badge>
          {skill.repoName && (
            <Badge size="1" variant="soft" color="gray">
              <Folder size={10} className="text-gray-9" />
              {skill.repoName}
            </Badge>
          )}
          {skill.source !== "bundled" && (
            <ExternalAppsOpener targetPath={skill.path} />
          )}
        </Flex>
      </Flex>

      <ScrollArea
        type="auto"
        scrollbars="vertical"
        className="scroll-area-constrain-width"
        style={{ height: "100%" }}
      >
        <Flex direction="column" gap="3" p="3">
          {skill.description && (
            <Text size="1" className="text-[12px] text-gray-10">
              {skill.description}
            </Text>
          )}

          {isLoading ? (
            <Text size="1" className="text-[12px] text-gray-9">
              Loading...
            </Text>
          ) : body ? (
            <Box className="rounded border border-gray-5 bg-gray-1 px-4 py-3">
              <MarkdownRenderer content={body} />
            </Box>
          ) : (
            <Text size="1" className="text-[12px] text-gray-9">
              No content in SKILL.md
            </Text>
          )}
        </Flex>
      </ScrollArea>
    </>
  );
}
