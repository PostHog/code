import type { ToolCall } from "@features/sessions/types";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExecuteToolView } from "./ExecuteToolView";

vi.mock("@phosphor-icons/react", () => ({
  Terminal: () => <span data-testid="icon-terminal">TerminalIcon</span>,
  Minus: () => <span data-testid="icon-minus">MinusIcon</span>,
  Plus: () => <span data-testid="icon-plus">PlusIcon</span>,
}));

vi.mock("@utils/path", () => ({
  compactHomePath: (p: string) => p,
}));

const baseToolCall: ToolCall = {
  toolCallId: "test-exec-1",
  title: "Run tests",
  kind: "execute",
  status: "completed",
  content: [],
  locations: [],
  rawInput: {
    command: "pnpm test -- --run",
    description: "Run tests",
  },
};

describe("ExecuteToolView", () => {
  it("aligns icon vertically centered with text content", () => {
    const { container } = render(<ExecuteToolView toolCall={baseToolCall} />);
    // The outermost flex should use align="center" for consistent icon alignment
    // Radix renders this as rt-r-ai-center
    const outerFlex = container.querySelector(".min-w-0");
    expect(outerFlex?.className).toContain("rt-r-ai-center");
  });

  it("applies min-w-0 to prevent text overflow", () => {
    const { container } = render(<ExecuteToolView toolCall={baseToolCall} />);
    const outerFlex = container.querySelector(".min-w-0");
    expect(outerFlex?.className).toContain("min-w-0");
  });

  it("truncates long commands to prevent overflow", () => {
    const longCommand =
      "find /very/long/path -type f -name '*.ts' | xargs grep -l 'pattern' | head -100";
    const { container } = render(
      <ExecuteToolView
        toolCall={{
          ...baseToolCall,
          rawInput: { command: longCommand },
        }}
      />,
    );
    // Command text should have truncation class
    // The command text should be in a truncated container
    const truncatedContainer = container.querySelector(".truncate");
    expect(truncatedContainer).toBeTruthy();
  });
});
