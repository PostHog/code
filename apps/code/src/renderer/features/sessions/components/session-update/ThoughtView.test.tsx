import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThoughtView } from "./ThoughtView";

// Mock phosphor icons to avoid rendering issues in jsdom
vi.mock("@phosphor-icons/react", () => ({
  Brain: () => <span data-testid="icon-brain">BrainIcon</span>,
  Plus: () => <span data-testid="icon-plus">PlusIcon</span>,
  Minus: () => <span data-testid="icon-minus">MinusIcon</span>,
}));

describe("ThoughtView", () => {
  it("applies left padding consistent with other tool views (pl-3)", () => {
    const { container } = render(
      <ThoughtView content="some thought" isLoading={false} />,
    );
    // ThoughtView root should have pl-3 to align with AgentMessage and ToolCallBlock
    const root = container.firstElementChild;
    expect(root?.className).toContain("pl-3");
  });

  it("renders the Thinking label", () => {
    render(<ThoughtView content="some thought" isLoading={false} />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("applies min-w-0 for text overflow containment", () => {
    const { container } = render(
      <ThoughtView content="some thought" isLoading={false} />,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain("min-w-0");
  });

  it("aligns icon vertically centered with text", () => {
    const { container } = render(
      <ThoughtView content="some thought" isLoading={false} />,
    );
    // The button should use flex with items-center for icon alignment
    const button = container.querySelector("button");
    expect(button?.className).toContain("items-center");
  });
});
