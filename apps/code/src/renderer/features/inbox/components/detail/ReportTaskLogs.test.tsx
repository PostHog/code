import { Theme } from "@radix-ui/themes";
import type { SignalReportStatus, Task } from "@shared/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportTasksRef: { current: { task: Task; relationship: string }[] } = {
  current: [],
};

vi.mock("@hooks/useAuthenticatedQuery", () => ({
  useAuthenticatedQuery: () => ({
    data: reportTasksRef.current,
    isLoading: false,
  }),
}));

vi.mock("@features/task-detail/components/TaskLogsPanel", () => ({
  TaskLogsPanel: ({ taskId }: { taskId: string }) => (
    <div data-testid="task-logs-panel">{`logs for ${taskId}`}</div>
  ),
}));

vi.mock("@features/inbox/components/utils/ReportImplementationPrLink", () => ({
  ReportImplementationPrLink: ({ prUrl }: { prUrl: string }) => (
    <a href={prUrl} onClick={(e) => e.stopPropagation()}>
      pr-link
    </a>
  ),
}));

import { ReportTaskLogs } from "./ReportTaskLogs";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    latest_run: overrides.latest_run ?? {
      status: "completed",
      stage: null,
      output: null,
    },
    ...overrides,
  } as Task;
}

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>);
}

describe("ReportTaskLogs", () => {
  beforeEach(() => {
    reportTasksRef.current = [];
  });

  it("clicking the same bar that was clicked to expand collapses it", async () => {
    const user = userEvent.setup();
    reportTasksRef.current = [
      {
        task: makeTask({ id: "research-1" }),
        relationship: "research",
      },
      {
        task: makeTask({ id: "impl-1" }),
        relationship: "implementation",
      },
    ];

    renderWithTheme(
      <ReportTaskLogs
        reportId="r1"
        reportStatus={"ready" as SignalReportStatus}
      />,
    );

    const researchBar = screen.getByRole("button", { name: /Research task/i });

    await user.click(researchBar);
    expect(screen.getByTestId("task-logs-panel")).toHaveTextContent(
      "logs for research-1",
    );

    // After expansion, the same bar should still be in the DOM and clickable.
    const expandedResearchBar = screen.getByRole("button", {
      name: /Research task/i,
    });
    await user.click(expandedResearchBar);
    expect(screen.queryByTestId("task-logs-panel")).not.toBeInTheDocument();
  });

  it("research bar expands when implementation task is also present and completed", async () => {
    const user = userEvent.setup();
    reportTasksRef.current = [
      { task: makeTask({ id: "research-1" }), relationship: "research" },
      {
        task: makeTask({ id: "impl-1" }),
        relationship: "implementation",
      },
    ];

    renderWithTheme(
      <ReportTaskLogs
        reportId="r1"
        reportStatus={"ready" as SignalReportStatus}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Research task/i }));

    expect(screen.getByTestId("task-logs-panel")).toHaveTextContent(
      "logs for research-1",
    );
  });

  it("clicking a different bar while one is expanded switches to the new bar", async () => {
    const user = userEvent.setup();
    reportTasksRef.current = [
      { task: makeTask({ id: "research-1" }), relationship: "research" },
      { task: makeTask({ id: "impl-1" }), relationship: "implementation" },
    ];

    renderWithTheme(
      <ReportTaskLogs
        reportId="r1"
        reportStatus={"ready" as SignalReportStatus}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Research task/i }));
    expect(screen.getByTestId("task-logs-panel")).toHaveTextContent(
      "logs for research-1",
    );

    await user.click(
      screen.getByRole("button", { name: /Implementation task/i }),
    );
    expect(screen.getByTestId("task-logs-panel")).toHaveTextContent(
      "logs for impl-1",
    );
  });
});
