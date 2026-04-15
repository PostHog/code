import type { ToolCall } from "@features/sessions/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolCallView } from "./ToolCallView";

vi.mock("@phosphor-icons/react", () => ({
  ArrowsClockwise: () => (
    <span data-testid="icon-arrows-clockwise">ArrowsClockwise</span>
  ),
  ArrowsLeftRight: () => (
    <span data-testid="icon-arrows-left-right">ArrowsLeftRight</span>
  ),
  Brain: () => <span data-testid="icon-brain">BrainIcon</span>,
  ChatCircle: () => <span data-testid="icon-chat-circle">ChatCircle</span>,
  Command: () => <span data-testid="icon-command">Command</span>,
  FileText: () => <span data-testid="icon-file-text">FileText</span>,
  Globe: () => <span data-testid="icon-globe">Globe</span>,
  MagnifyingGlass: () => (
    <span data-testid="icon-magnifying-glass">MagnifyingGlass</span>
  ),
  Minus: () => <span data-testid="icon-minus">MinusIcon</span>,
  PencilSimple: () => (
    <span data-testid="icon-pencil-simple">PencilSimple</span>
  ),
  Plus: () => <span data-testid="icon-plus">PlusIcon</span>,
  Terminal: () => <span data-testid="icon-terminal">Terminal</span>,
  Trash: () => <span data-testid="icon-trash">Trash</span>,
  Wrench: () => <span data-testid="icon-wrench">WrenchIcon</span>,
}));

vi.mock("@utils/path", () => ({
  compactHomePath: (p: string) => p,
}));

const baseToolCall: ToolCall = {
  toolCallId: "test-1",
  title: "Test Tool",
  kind: "other",
  status: "completed",
  content: [],
  locations: [],
  rawInput: { key: "value" },
};

describe("ToolCallView", () => {
  it("aligns icon vertically centered with text content", () => {
    const { container } = render(<ToolCallView toolCall={baseToolCall} />);
    // The outer flex container should use align="center" for
    // consistent icon vertical alignment with other tool views like ToolRow
    // Radix renders align="center" as rt-r-ai-center
    const outerFlex = container.querySelector(".min-w-0");
    expect(outerFlex?.className).toContain("rt-r-ai-center");
  });

  it("applies min-w-0 to prevent text overflow from expanding container", () => {
    const { container } = render(<ToolCallView toolCall={baseToolCall} />);
    const outerFlex = container.querySelector(".min-w-0");
    expect(outerFlex?.className).toContain("min-w-0");
  });

  it("wraps title text with overflow handling for long titles", () => {
    const longTitle =
      "This is a very long tool call title that should not overflow its container";
    render(<ToolCallView toolCall={{ ...baseToolCall, title: longTitle }} />);
    // Title text should have truncation or break-words to prevent overflow
    const titleElement = screen.getByText(longTitle);
    const parent = titleElement.closest(".min-w-0");
    expect(parent).toBeTruthy();
  });
});
