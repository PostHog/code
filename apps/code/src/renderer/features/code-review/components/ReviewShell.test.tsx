import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock heavy dependencies that ReviewShell.tsx transitively imports
vi.mock("@renderer/features/code-review/stores/reviewNavigationStore", () => ({
  useReviewNavigationStore: vi.fn(),
}));

vi.mock("@features/code-editor/stores/diffViewerStore", () => ({
  useDiffViewerStore: vi.fn(),
}));

vi.mock("@features/task-detail/components/ChangesPanel", () => ({
  ChangesPanel: () => null,
}));

vi.mock("@features/git-interaction/utils/diffStats", () => ({
  computeDiffStats: () => ({ linesAdded: 0, linesRemoved: 0 }),
}));

vi.mock("@stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ isDarkMode: false })),
}));

vi.mock("@pierre/diffs/react", () => ({
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@pierre/diffs/worker/worker.js?worker&url", () => ({
  default: "",
}));

vi.mock("@components/ui/FileIcon", () => ({
  FileIcon: () => <span data-testid="file-icon" />,
}));

import { DeferredDiffPlaceholder, DiffFileHeader } from "./ReviewShell";

// Minimal FileDiffMetadata shape for the test
function makeFileDiff(name: string) {
  return {
    name,
    prevName: null,
    hunks: [{ additionLines: 3, deletionLines: 1 }],
  } as unknown as import("@pierre/diffs/react").FileDiffMetadata;
}

/**
 * Helper: find the filepath wrapper element in a rendered FileHeaderRow.
 * The filepath is split into two spans: a gray directory span and a bold filename span.
 * Their parent container must prevent wrapping between them.
 */
function getFilePathWrapper(container: HTMLElement): HTMLElement {
  const button = container.querySelector("button");
  expect(button).toBeTruthy();

  const spans = button!.querySelectorAll<HTMLSpanElement>("span");
  // Find the span that contains the directory path (has gray color, no fontWeight)
  const dirSpan = Array.from(spans).find(
    (s) => s.style.color === "var(--gray-9)" && !s.style.fontWeight,
  );
  expect(dirSpan).toBeTruthy();

  // Find the bold filename span
  const fileNameSpan = Array.from(spans).find(
    (s) => s.style.fontWeight === "600",
  );
  expect(fileNameSpan).toBeTruthy();

  // Both spans should share the same parent wrapper
  expect(dirSpan?.parentElement).toBe(fileNameSpan?.parentElement);

  return dirSpan?.parentElement!;
}

function hasNoWrapOrTruncation(el: HTMLElement): boolean {
  const inline = el.style.whiteSpace === "nowrap";
  const computed = getComputedStyle(el).whiteSpace === "nowrap";
  const overflow = el.style.overflow === "hidden";
  const textOverflow =
    el.style.textOverflow === "ellipsis" ||
    getComputedStyle(el).textOverflow === "ellipsis";
  return inline || computed || overflow || textOverflow;
}

describe("DiffFileHeader", () => {
  it("renders the directory path and filename", () => {
    const { container } = render(
      <DiffFileHeader
        fileDiff={makeFileDiff(
          "src/renderer/features/code-review/components/ReviewShell.tsx",
        )}
        collapsed={false}
        onToggle={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.textContent).toContain(
      "src/renderer/features/code-review/components/",
    );
    expect(button?.textContent).toContain("ReviewShell.tsx");
  });

  it("keeps the filepath on a single line (no wrapping between dir and filename)", () => {
    const longPath =
      "src/renderer/features/code-review/components/very-deeply-nested-directory/structure/ReviewShell.tsx";

    const { container } = render(
      <DiffFileHeader
        fileDiff={makeFileDiff(longPath)}
        collapsed={false}
        onToggle={() => {}}
      />,
    );

    const wrapper = getFilePathWrapper(container);
    expect(hasNoWrapOrTruncation(wrapper)).toBe(true);
  });
});

describe("DeferredDiffPlaceholder", () => {
  it("renders the directory path and filename", () => {
    const { container } = render(
      <DeferredDiffPlaceholder
        filePath="packages/core/src/utils/diff.ts"
        linesAdded={10}
        linesRemoved={2}
        reason="generated"
        collapsed={false}
        onToggle={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.textContent).toContain("packages/core/src/utils/");
    expect(button?.textContent).toContain("diff.ts");
  });

  it("keeps the filepath on a single line", () => {
    const longPath =
      "packages/core/src/utils/very/deeply/nested/structure/with/many/segments/helper.ts";

    const { container } = render(
      <DeferredDiffPlaceholder
        filePath={longPath}
        linesAdded={10}
        linesRemoved={2}
        reason="generated"
        collapsed={false}
        onToggle={() => {}}
      />,
    );

    const wrapper = getFilePathWrapper(container);
    expect(hasNoWrapOrTruncation(wrapper)).toBe(true);
  });
});
