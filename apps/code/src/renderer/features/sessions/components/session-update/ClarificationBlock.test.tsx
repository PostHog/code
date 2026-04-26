import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "../../types";

const mockMutate = vi.fn();

vi.mock("@renderer/trpc/client", () => ({
  useTRPC: () => ({
    posthogCodeMcp: {
      resolveClarification: {
        mutationOptions: () => ({}),
      },
    },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

import { ClarificationBlock } from "./ClarificationBlock";

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolCallId: "req-1",
    title: "askClarification",
    status: "in_progress",
    rawInput: {
      questions: [
        {
          id: "q1",
          question: "What's the primary user action?",
          prefilledAnswer: "Track habits",
          kind: "text",
        },
        {
          id: "q2",
          question: "What style?",
          prefilledAnswer: "Minimalist",
          kind: "select",
          options: ["Minimalist", "Playful"],
        },
      ],
      roundIndex: 0,
      roundsTotal: 3,
    },
    ...overrides,
  };
}

describe("ClarificationBlock", () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it("renders all questions with prefilled values populated", () => {
    render(
      <Theme>
        <ClarificationBlock toolCall={makeToolCall()} />
      </Theme>,
    );

    expect(
      screen.getByText("What's the primary user action?"),
    ).toBeInTheDocument();
    expect(screen.getByText("What style?")).toBeInTheDocument();

    const textInput = screen.getByDisplayValue(
      "Track habits",
    ) as HTMLInputElement;
    expect(textInput).toBeInTheDocument();

    expect(screen.getByText("Round 1 of 3")).toBeInTheDocument();
  });

  it("submits the form values via the resolveClarification mutation", () => {
    render(
      <Theme>
        <ClarificationBlock toolCall={makeToolCall()} />
      </Theme>,
    );

    const textInput = screen.getByDisplayValue(
      "Track habits",
    ) as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: "Log workouts" } });

    const submitButton = screen.getByRole("button", {
      name: "Submit answers",
    });
    fireEvent.click(submitButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      requestId: "req-1",
      answers: [
        { id: "q1", answer: "Log workouts" },
        { id: "q2", answer: "Minimalist" },
      ],
      stop: false,
    });
  });

  it("'Stop and start scaffolding' submits with stop:true and prefilled defaults", () => {
    render(
      <Theme>
        <ClarificationBlock toolCall={makeToolCall()} />
      </Theme>,
    );

    // User edited the field — but stopping should still send the prefilled value.
    const textInput = screen.getByDisplayValue(
      "Track habits",
    ) as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: "Edited" } });

    const stopButton = screen.getByRole("button", {
      name: "Stop and start scaffolding",
    });
    fireEvent.click(stopButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      requestId: "req-1",
      answers: [
        { id: "q1", answer: "Track habits" },
        { id: "q2", answer: "Minimalist" },
      ],
      stop: true,
    });
  });
});
