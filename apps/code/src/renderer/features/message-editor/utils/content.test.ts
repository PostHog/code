import { describe, expect, it } from "vitest";
import { contentToXml, type EditorContent, xmlToContent } from "./content";

describe("xmlToContent", () => {
  it("parses a file tag into a file chip", () => {
    const result = xmlToContent('<file path="src/foo/bar.ts" />');
    expect(result).toEqual({
      segments: [
        {
          type: "chip",
          chip: { type: "file", id: "src/foo/bar.ts", label: "foo/bar.ts" },
        },
      ],
    });
  });

  it("derives file label from the final path segment when no parent", () => {
    const result = xmlToContent('<file path="README.md" />');
    expect(result.segments).toEqual([
      {
        type: "chip",
        chip: { type: "file", id: "README.md", label: "README.md" },
      },
    ]);
  });

  it("unescapes XML attributes", () => {
    const result = xmlToContent('<file path="a/&quot;weird&quot;.ts" />');
    const segment = result.segments[0];
    expect(segment.type).toBe("chip");
    if (segment.type === "chip") {
      expect(segment.chip.id).toBe('a/"weird".ts');
    }
  });

  it("parses github_issue tags with title", () => {
    const xml =
      '<github_issue number="42" title="Fix bug" url="https://github.com/org/repo/issues/42" />';
    expect(xmlToContent(xml).segments).toEqual([
      {
        type: "chip",
        chip: {
          type: "github_issue",
          id: "https://github.com/org/repo/issues/42",
          label: "#42 - Fix bug",
        },
      },
    ]);
  });

  it("parses github_issue tags without title", () => {
    const xml =
      '<github_issue number="7" url="https://github.com/org/repo/issues/7" />';
    const segment = xmlToContent(xml).segments[0];
    expect(segment.type).toBe("chip");
    if (segment.type === "chip") {
      expect(segment.chip.label).toBe("#7");
    }
  });

  it.each([
    ["error", "err-1"],
    ["experiment", "exp-1"],
    ["insight", "ins-1"],
    ["feature_flag", "flag-1"],
  ])("parses %s tag into a chip with id as label", (type, id) => {
    const xml = `<${type} id="${id}" />`;
    expect(xmlToContent(xml).segments).toEqual([
      { type: "chip", chip: { type, id, label: id } },
    ]);
  });

  it("preserves surrounding text around chips", () => {
    const result = xmlToContent(
      'please review <file path="src/a.ts" /> and <file path="src/b.ts" />',
    );
    expect(result.segments).toEqual([
      { type: "text", text: "please review " },
      {
        type: "chip",
        chip: { type: "file", id: "src/a.ts", label: "src/a.ts" },
      },
      { type: "text", text: " and " },
      {
        type: "chip",
        chip: { type: "file", id: "src/b.ts", label: "src/b.ts" },
      },
    ]);
  });

  it("returns a single text segment when no tags are present", () => {
    expect(xmlToContent("just plain text").segments).toEqual([
      { type: "text", text: "just plain text" },
    ]);
  });

  it("returns a single text segment for empty input", () => {
    expect(xmlToContent("").segments).toEqual([{ type: "text", text: "" }]);
  });

  it("round-trips contentToXml for a mix of text and chips", () => {
    const content: EditorContent = {
      segments: [
        { type: "text", text: "look at " },
        {
          type: "chip",
          chip: { type: "file", id: "apps/code/src/a.ts", label: "src/a.ts" },
        },
        { type: "text", text: " and " },
        {
          type: "chip",
          chip: {
            type: "github_issue",
            id: "https://github.com/org/repo/issues/9",
            label: "#9 - Thing",
          },
        },
      ],
    };

    const xml = contentToXml(content);
    const parsed = xmlToContent(xml);
    expect(parsed.segments).toEqual([
      { type: "text", text: "look at " },
      {
        type: "chip",
        chip: { type: "file", id: "apps/code/src/a.ts", label: "src/a.ts" },
      },
      { type: "text", text: " and " },
      {
        type: "chip",
        chip: {
          type: "github_issue",
          id: "https://github.com/org/repo/issues/9",
          label: "#9 - Thing",
        },
      },
    ]);
  });
});
