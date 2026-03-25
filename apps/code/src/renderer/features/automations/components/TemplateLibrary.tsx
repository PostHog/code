import { MagnifyingGlass, Star } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { AutomationTemplate } from "@shared/types/automations";
import { useMemo, useState } from "react";
import { AUTOMATION_TEMPLATES } from "../templates";

interface TemplateLibraryProps {
  onApply: (templateId: string) => void;
}

const CATEGORIES = [
  "All",
  ...new Set(AUTOMATION_TEMPLATES.map((t) => t.category)),
] as const;

function TemplateCard({
  template,
  onApply,
}: {
  template: AutomationTemplate;
  onApply: (id: string) => void;
}) {
  return (
    <Box className="min-w-[220px] flex-1 rounded-lg border border-gray-5 bg-gray-1 p-3">
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between" gap="2">
          <Flex align="center" gap="1">
            {template.recommended && (
              <Star size={12} weight="fill" className="text-amber-9" />
            )}
            <Text size="2" weight="medium">
              {template.name}
            </Text>
          </Flex>
          <Badge size="1" variant="soft">
            {template.category}
          </Badge>
        </Flex>
        <Text size="1" className="text-gray-10">
          {template.description}
        </Text>
        {template.mcps && template.mcps.length > 0 && (
          <Flex gap="1" wrap="wrap">
            {template.mcps.map((mcp) => (
              <Badge key={mcp} size="1" variant="outline" color="gray">
                {mcp}
              </Badge>
            ))}
          </Flex>
        )}
        <Button size="1" variant="soft" onClick={() => onApply(template.id)}>
          Use template
        </Button>
      </Flex>
    </Box>
  );
}

export function TemplateLibrary({ onApply }: TemplateLibraryProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const recommended = useMemo(
    () => AUTOMATION_TEMPLATES.filter((t) => t.recommended),
    [],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return AUTOMATION_TEMPLATES.filter((t) => {
      if (activeCategory !== "All" && t.category !== activeCategory)
        return false;
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q) &&
        !t.tags.some((tag) => tag.includes(q)) &&
        !(t.mcps ?? []).some((m) => m.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [search, activeCategory]);

  const showRecommended = !search && activeCategory === "All";

  return (
    <Flex direction="column" gap="3">
      {/* Recommended section */}
      {showRecommended && recommended.length > 0 && (
        <Flex direction="column" gap="2">
          <Flex align="center" gap="1">
            <Star size={12} weight="fill" className="text-amber-9" />
            <Text
              size="1"
              weight="medium"
              className="font-mono text-[11px]"
            >
              Recommended
            </Text>
          </Flex>
          <Flex gap="3" wrap="wrap">
            {recommended.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onApply={onApply}
              />
            ))}
          </Flex>
        </Flex>
      )}

      {/* All templates */}
      <Flex direction="column" gap="2">
        <Text size="1" weight="medium" className="font-mono text-[11px]">
          {showRecommended ? "All templates" : "Template library"}
        </Text>

        {/* Search + category filter */}
        <Flex gap="2" align="center" wrap="wrap">
          <TextField.Root
            size="1"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
          >
            <TextField.Slot>
              <MagnifyingGlass size={12} />
            </TextField.Slot>
          </TextField.Root>
          <Flex gap="1" wrap="wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                size="1"
                variant={activeCategory === cat ? "solid" : "soft"}
                color={activeCategory === cat ? undefined : "gray"}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </Flex>
        </Flex>

        {/* Template grid */}
        <Flex gap="3" wrap="wrap">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onApply={onApply}
            />
          ))}
          {filtered.length === 0 && (
            <Text size="1" className="text-gray-10 py-4">
              No templates match your search.
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
