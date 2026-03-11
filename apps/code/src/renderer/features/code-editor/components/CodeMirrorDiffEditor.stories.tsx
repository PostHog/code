import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { useThemeStore } from "@stores/themeStore";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { CodeMirrorDiffEditor } from "./CodeMirrorDiffEditor";

const originalCode = `import { formatDate, parseJSON } from "./utils";
import { Logger } from "./logger";

interface ProcessOptions {
  timeout: number;
  retries: number;
}

const DEFAULT_TIMEOUT = 5000;

export function processItems(items: string[], options: ProcessOptions) {
  const log = new Logger("processor");
  log.info("Starting processing", { count: items.length });

  const results: string[] = [];
  for (const item of items) {
    if (item.startsWith("#")) {
      continue;
    }
    const parsed = parseJSON(item);
    results.push(formatDate(parsed.timestamp));
  }

  log.info("Processing complete", { resultCount: results.length });
  return results;
}

export function validateInput(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

export function deprecatedHelper(data: string): string {
  return data.trim().toLowerCase();
}

export function getVersion(): string {
  return "1.0.0";
}
`;

const modifiedCode = `import { formatDate, parseJSON, batchProcess } from "./utils";
import { Logger } from "./logger";

interface ProcessOptions {
  timeout: number;
  retries: number;
  batchSize?: number;
}

const DEFAULT_TIMEOUT = 10000;

export function processItems(entries: string[], options: ProcessOptions) {
  const log = new Logger("processor");
  log.info("Starting processing", { count: entries.length });

  const results: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith("#") || entry.startsWith("//")) {
      continue;
    }
    const parsed = parseJSON(entry);
    const formatted = formatDate(parsed.timestamp);
    if (formatted) {
      results.push(formatted);
    }
  }

  log.info("Processing complete", { resultCount: results.length });
  return results;
}

export function validateInput(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

export function processBatch(
  entries: string[],
  options: ProcessOptions,
): string[] {
  const batchSize = options.batchSize ?? 100;
  const batches: string[][] = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(entries.slice(i, i + batchSize));
  }

  return batches.flatMap((batch) => batchProcess(batch));
}

export function getVersion(): string {
  return "2.0.0";
}
`;

function withDiffViewerState(
  state: Partial<{
    viewMode: "split" | "unified";
    wordWrap: boolean;
    loadFullFiles: boolean;
    wordDiffs: boolean;
  }>,
): Decorator {
  return (Story) => {
    useDiffViewerStore.setState(state);
    return <Story />;
  };
}

const meta: Meta<typeof CodeMirrorDiffEditor> = {
  title: "Features/CodeEditor/CodeMirrorDiffEditor",
  component: CodeMirrorDiffEditor,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.theme !== "light";
      useThemeStore.setState({
        theme: isDark ? "dark" : "light",
        isDarkMode: isDark,
      });
      return (
        <div
          style={{ height: "600px", display: "flex", flexDirection: "column" }}
        >
          <Story />
        </div>
      );
    },
  ],
  beforeEach: () => {
    useDiffViewerStore.setState({
      viewMode: "unified",
      wordWrap: true,
      loadFullFiles: false,
      wordDiffs: true,
    });
  },
  argTypes: {
    onContentChange: { action: "content-changed" },
    onRefresh: { action: "refresh" },
  },
  args: {
    originalContent: originalCode,
    modifiedContent: modifiedCode,
  },
};

export default meta;
type Story = StoryObj<typeof CodeMirrorDiffEditor>;

export const UnifiedView: Story = {};

export const SplitView: Story = {
  decorators: [withDiffViewerState({ viewMode: "split" })],
};

export const UnifiedFullFile: Story = {
  decorators: [withDiffViewerState({ loadFullFiles: true })],
};

export const SplitFullFile: Story = {
  decorators: [withDiffViewerState({ viewMode: "split", loadFullFiles: true })],
};

export const WithoutWordDiffs: Story = {
  decorators: [withDiffViewerState({ wordDiffs: false })],
};

export const Editable: Story = {};

export const WithRelativePath: Story = {
  args: {
    relativePath: "src/services/dataProcessor.ts",
  },
};
