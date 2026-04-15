import { ScrollView, Text, View } from "react-native";

interface MarkdownTextProps {
  content: string;
}

// Lightweight markdown renderer for agent messages.
// Handles: code blocks, inline code, bold, italic, headers, bullet/numbered lists, tables.

interface Block {
  type: "paragraph" | "code" | "heading" | "list" | "table";
  content: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
  rows?: string[][];
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Unordered list (consecutive - or * lines)
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items });
      continue;
    }

    // Ordered list (consecutive 1. 2. lines)
    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: true });
      continue;
    }

    // Table: lines with pipes, second line is separator (|---|---|)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+\|/.test(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i]
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim());
        // Skip the separator row
        if (!/^[\s-:|]+$/.test(lines[i].replace(/\|/g, ""))) {
          rows.push(row);
        }
        i++;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", content: "", rows });
      }
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].match(/^#{1,3}\s/) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+[.)]\s/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+\|/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(
        <Text key={match.index} className="font-bold">
          {match[2]}
        </Text>,
      );
    } else if (match[3]) {
      nodes.push(
        <Text key={match.index} className="italic">
          {match[3]}
        </Text>,
      );
    } else if (match[4]) {
      nodes.push(
        <Text
          key={match.index}
          className="rounded bg-gray-4 px-1 font-mono text-[12px] text-accent-11"
        >
          {match[4]}
        </Text>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function MarkdownText({ content }: MarkdownTextProps) {
  const blocks = parseBlocks(content);

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, i) => {
        const key = `block-${i}`;

        switch (block.type) {
          case "code":
            return (
              <View
                key={key}
                className="rounded-md border border-gray-6 bg-gray-3 px-3 py-2"
              >
                <Text
                  className="font-mono text-[12px] text-gray-12 leading-4"
                  selectable
                >
                  {block.content}
                </Text>
              </View>
            );

          case "heading":
            return (
              <Text
                key={key}
                className={`font-bold text-gray-12 ${
                  block.level === 1
                    ? "text-[16px]"
                    : block.level === 2
                      ? "text-[14px]"
                      : "text-[13px]"
                }`}
              >
                {renderInline(block.content)}
              </Text>
            );

          case "list":
            return (
              <View key={key} style={{ gap: 4 }}>
                {block.items?.map((item, idx) => (
                  <View
                    key={`${key}-${idx}-${item}`}
                    className="flex-row items-start pl-2"
                  >
                    <Text className="mr-2 text-[13px] text-gray-9">
                      {block.ordered ? `${idx + 1}.` : "•"}
                    </Text>
                    <Text className="flex-1 text-[13px] text-gray-12 leading-5">
                      {renderInline(item)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case "table": {
            const rows = block.rows ?? [];
            const header = rows[0];
            const body = rows.slice(1);
            return (
              <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false}>
                <View className="overflow-hidden rounded-md border border-gray-6">
                  {header && (
                    <View className="flex-row bg-gray-3">
                      {header.map((cell, ci) => (
                        <View
                          key={`${key}-h-${ci}`}
                          className="border-gray-6 px-3 py-1.5"
                          style={ci > 0 ? { borderLeftWidth: 1, borderLeftColor: "#3333" } : undefined}
                        >
                          <Text className="font-bold text-[12px] text-gray-12">
                            {renderInline(cell)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {body.map((row, ri) => (
                    <View
                      key={`${key}-r-${ri}`}
                      className="flex-row border-t border-gray-6"
                    >
                      {row.map((cell, ci) => (
                        <View
                          key={`${key}-r-${ri}-c-${ci}`}
                          className="px-3 py-1.5"
                          style={ci > 0 ? { borderLeftWidth: 1, borderLeftColor: "#3333" } : undefined}
                        >
                          <Text className="text-[12px] text-gray-12">
                            {renderInline(cell)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          }

          default:
            return (
              <Text key={key} className="text-[13px] text-gray-12 leading-5">
                {renderInline(block.content)}
              </Text>
            );
        }
      })}
    </View>
  );
}
