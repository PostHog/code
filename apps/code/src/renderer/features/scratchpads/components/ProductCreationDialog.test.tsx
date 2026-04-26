import { Theme } from "@radix-ui/themes";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ------------------------------------------------------

const mockSagaRun = vi.hoisted(() => vi.fn());
const mockSagaCtor = vi.hoisted(() => vi.fn());
const mockNavigateToTask = vi.hoisted(() => vi.fn());
const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@renderer/sagas/scratchpad/scratchpad-creation", () => ({
  ScratchpadCreationSaga: class {
    constructor(deps: unknown) {
      mockSagaCtor(deps);
    }
    async run(input: unknown) {
      return mockSagaRun(input);
    }
  },
}));

vi.mock("@hooks/useAuthenticatedClient", () => ({
  useAuthenticatedClient: () => mockClient,
}));

vi.mock("@features/scratchpads/components/ProjectPicker", () => ({
  ProjectPicker: ({
    value,
    onChange,
  }: {
    value: number | null;
    onChange: (id: number) => void;
  }) => (
    <button
      type="button"
      data-testid="project-picker"
      data-value={value ?? ""}
      onClick={() => onChange(42)}
    >
      Pick project
    </button>
  ),
}));

vi.mock("@stores/navigationStore", () => ({
  useNavigationStore: (selector: (s: unknown) => unknown) =>
    selector({ navigateToTask: mockNavigateToTask }),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { useScratchpadCreationStore } from "../stores/scratchpadCreationStore";
// Imports after mocks so module-level refs pick them up.
import { ProductCreationDialog } from "./ProductCreationDialog";

function renderDialog() {
  return render(
    <Theme>
      <ProductCreationDialog />
    </Theme>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText("Uber for dogs"), {
    target: { value: "My Product" },
  });
  fireEvent.change(
    screen.getByPlaceholderText(/Web app to get a dog delivered on demand/),
    { target: { value: "An idea" } },
  );
}

describe("ProductCreationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScratchpadCreationStore.getState().reset();
    useScratchpadCreationStore.getState().openDialog();
    mockGetCurrentUser.mockResolvedValue({
      organization: { id: "org-1" },
    });
    mockSagaRun.mockResolvedValue({
      success: true,
      data: {
        task: { id: "task-1" },
        workspace: {},
        scratchpadPath: "/sp",
        projectId: 42,
        autoCreatedProject: true,
      },
    });
  });

  afterEach(() => {
    useScratchpadCreationStore.getState().reset();
  });

  it("defaults rounds to 3 and exposes 1..4 in the segmented control", () => {
    renderDialog();
    expect(screen.getByText(/I'll ask up to/)).toBeInTheDocument();
    expect(
      screen.getByText(/of clarifying questions to shape your product\./),
    ).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "3" })).toBeChecked();
    for (const n of ["1", "2", "3", "4"]) {
      expect(screen.getByRole("radio", { name: n })).toBeInTheDocument();
    }

    // Switch to 4
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(screen.getByRole("radio", { name: "4" })).toBeChecked();

    // The selector caps at 4 — there is no "5" option rendered.
    expect(screen.queryByRole("radio", { name: "5" })).toBeNull();
  });

  it("submit with default 'later' mode passes no projectId (link decided at publish time)", async () => {
    renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: /create product/i }));

    await waitFor(() => {
      expect(mockSagaRun).toHaveBeenCalledTimes(1);
    });

    const input = mockSagaRun.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      productName: "My Product",
      initialIdea: "An idea",
      rounds: 3,
    });
    expect(input.projectId).toBeUndefined();
    // No project create-or-link work happens at scratchpad creation time.
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });

  it("submit with an existing project passes projectId", async () => {
    renderDialog();
    fillRequiredFields();

    // Toggle to 'Use existing project'
    fireEvent.click(screen.getByLabelText(/Use existing project/i));
    // ProjectPicker mock click sets value to 42
    fireEvent.click(screen.getByTestId("project-picker"));

    fireEvent.click(screen.getByRole("button", { name: /create product/i }));

    await waitFor(() => {
      expect(mockSagaRun).toHaveBeenCalledTimes(1);
    });

    const input = mockSagaRun.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      productName: "My Product",
      initialIdea: "An idea",
      rounds: 3,
      projectId: 42,
    });
    // getCurrentUser should NOT be called in the existing-project path.
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });

  it("disables the submit button while submitting", async () => {
    let resolveRun: (value: unknown) => void = () => {};
    mockSagaRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    renderDialog();
    fillRequiredFields();

    const submit = screen.getByRole("button", { name: /create product/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(useScratchpadCreationStore.getState().step).toBe("submitting");
    });
    expect(submit).toBeDisabled();

    // Re-clicking does nothing — saga only ran once.
    fireEvent.click(submit);
    expect(mockSagaRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRun({
        success: true,
        data: {
          task: { id: "task-1" },
          workspace: {},
          scratchpadPath: "/sp",
          projectId: 42,
          autoCreatedProject: true,
        },
      });
    });
  });

  it("surfaces saga errors in the store and re-enables submit", async () => {
    mockSagaRun.mockResolvedValueOnce({
      success: false,
      error: "things broke",
      failedStep: "task_creation",
    });

    renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: /create product/i }));

    await waitFor(() => {
      expect(useScratchpadCreationStore.getState().lastError).toBe(
        "things broke",
      );
    });

    expect(useScratchpadCreationStore.getState().step).toBe("idle");
    expect(
      screen.getByRole("button", { name: /create product/i }),
    ).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("things broke");
  });

  it("submit is disabled when required fields are empty", () => {
    renderDialog();
    expect(
      screen.getByRole("button", { name: /create product/i }),
    ).toBeDisabled();
  });
});
