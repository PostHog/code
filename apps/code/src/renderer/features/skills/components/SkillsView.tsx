import { ResizableSidebar } from "@components/ResizableSidebar";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Lightbulb, MagnifyingGlass } from "@phosphor-icons/react";
import { Box, Flex, ScrollArea, Text, TextField } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import type { SkillInfo, SkillSource } from "@shared/types/skills";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSkillsSidebarStore } from "../stores/skillsSidebarStore";
import { SkillSection, SOURCE_CONFIG } from "./SkillCard";
import { SkillDetailPanel } from "./SkillDetailPanel";

const SOURCE_ORDER: SkillSource[] = ["user", "marketplace", "repo", "bundled"];

export function SkillsView() {
  const trpcReact = useTRPC();
  const { data: skills = [], isLoading } = useQuery(
    trpcReact.skills.list.queryOptions(undefined, { staleTime: 30_000 }),
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    isResizing,
    setIsResizing,
  } = useSkillsSidebarStore();

  const selectedSkill = useMemo(() => {
    if (skills.length === 0) return null;
    if (selectedPath !== null) {
      return skills.find((s) => s.path === selectedPath) ?? skills[0];
    }
    return skills[0];
  }, [skills, selectedPath]);

  const handleSelect = useCallback((path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path));
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSelectedPath(null);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<SkillSource, SkillInfo[]>();
    for (const source of SOURCE_ORDER) {
      map.set(source, []);
    }
    const query = searchQuery.trim().toLowerCase();
    for (const skill of skills) {
      if (
        query &&
        !skill.name.toLowerCase().includes(query) &&
        !(skill.description?.toLowerCase().includes(query) ?? false)
      ) {
        continue;
      }
      const list = map.get(skill.source);
      if (list) {
        list.push(skill);
      }
    }
    return map;
  }, [skills, searchQuery]);

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <Lightbulb size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap text-[13px]"
          title="Skills"
        >
          Skills
        </Text>
      </Flex>
    ),
    [],
  );

  useSetHeaderContent(headerContent);

  return (
    <Flex direction="column" height="100%" className="overflow-hidden">
      <Flex style={{ minHeight: 0 }} className="flex-1">
        <Box flexGrow="1" style={{ minWidth: 0 }}>
          <ScrollArea
            type="auto"
            className="scroll-area-constrain-width"
            style={{ height: "100%" }}
          >
            <Box px="4" py="3">
              <Box pb="3">
                <TextField.Root
                  size="2"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-[13px]"
                >
                  <TextField.Slot>
                    <MagnifyingGlass size={14} />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              {skills.length === 0 && !isLoading ? (
                <Flex
                  align="center"
                  justify="center"
                  direction="column"
                  gap="3"
                  className="py-12"
                >
                  <Box className="rounded-lg border border-gray-6 border-dashed p-4">
                    <Lightbulb size={24} className="text-gray-8" />
                  </Box>
                  <Text size="2" className="text-[13px] text-gray-10">
                    No skills found
                  </Text>
                </Flex>
              ) : (
                <Flex direction="column" gap="5">
                  {SOURCE_ORDER.map((source) => {
                    const items = grouped.get(source);
                    if (!items || items.length === 0) return null;
                    const config = SOURCE_CONFIG[source];

                    return (
                      <SkillSection
                        key={source}
                        title={config.sectionTitle}
                        skills={items}
                        selectedPath={selectedSkill?.path ?? null}
                        onSelect={handleSelect}
                      />
                    );
                  })}
                </Flex>
              )}
            </Box>
          </ScrollArea>
        </Box>

        <ResizableSidebar
          open={!!selectedSkill}
          width={sidebarWidth}
          setWidth={setSidebarWidth}
          isResizing={isResizing}
          setIsResizing={setIsResizing}
          side="right"
        >
          {selectedSkill && (
            <SkillDetailPanel
              skill={selectedSkill}
              onClose={handleCloseSidebar}
            />
          )}
        </ResizableSidebar>
      </Flex>
    </Flex>
  );
}
