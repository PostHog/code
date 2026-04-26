import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ------------------------------------------------------

const mockSagaRun = vi.hoisted(() => vi.fn());
const mockSagaCtor = vi.hoisted(() => vi.fn());
const mockNavigateToTask = vi.hoisted(() => vi.fn());
const mockConnectToTask = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
const mockClient = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
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
    onChange,
  }: {
    value: number | null;
    onChange: (id: number) => void;
  }) => (
    <button
      type="button"
      data-testid="project-picker"
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

vi.mock("@features/sessions/service/service", () => ({
  getSessionService: () => ({ connectToTask: mockConnectToTask }),
}));

vi.mock("@features/tasks/hooks/useTasks", () => ({
  useCreateTask: () => ({ invalidateTasks: vi.fn() }),
}));

vi.mock("@utils/toast", () => ({ toast: mockToast }));

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

vi.mock("@features/settings/stores/settingsStore", () => ({
  useSettingsStore: () => ({
    lastUsedAdapter: "claude",
    setLastUsedAdapter: vi.fn(),
    allowBypassPermissions: false,
    defaultInitialTaskMode: "last_used",
    lastUsedInitialTaskMode: "plan",
  }),
}));

vi.mock("../../task-detail/hooks/usePreviewConfig", () => ({
  usePreviewConfig: () => ({
    configOptions: [],
    modeOption: undefined,
    modelOption: undefined,
    thoughtOption: undefined,
    isLoading: false,
    setConfigOption: vi.fn(),
  }),
}));

vi.mock("@features/sessions/components/UnifiedModelSelector", () => ({
  UnifiedModelSelector: () => <div data-testid="model-selector" />,
}));

vi.mock("@features/sessions/components/ReasoningLevelSelector", () => ({
  ReasoningLevelSelector: () => <div data-testid="reasoning-selector" />,
}));

vi.mock("@features/sessions/stores/sessionStore", () => ({
  getCurrentModeFromConfigOptions: () => undefined,
}));

// Stub PromptInput with a minimal textarea + ref handle so tests can drive
// the editor via fireEvent + the editorRef contract the dialog uses.
vi.mock("@features/message-editor/components/PromptInput", () => ({
  PromptInput: forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    const onEmptyChange = props.onEmptyChange as
      | ((isEmpty: boolean) => void)
      | undefined;
    const placeholder = props.placeholder as string | undefined;
    const disabled = props.disabled as boolean | undefined;
    const modelSelector = props.modelSelector as React.ReactNode;
    const reasoningSelector = props.reasoningSelector as React.ReactNode;
    let text = "";
    useImperativeHandle(ref, () => ({
      getContent: () => ({ type: "doc", content: [] }) as unknown,
      getText: () => text,
      clear: () => {
        text = "";
        onEmptyChange?.(true);
      },
      focus: () => {},
      addAttachment: () => {},
    }));
    return (
      <div>
        <textarea
          data-testid="prompt-input"
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            text = e.target.value;
            onEmptyChange?.(text.trim().length === 0);
          }}
        />
        {modelSelector}
        {reasoningSelector}
      </div>
    );
  }),
}));

vi.mock("@features/message-editor/utils/content", () => ({
  contentToXml: () => "An idea",
  extractFilePaths: () => [],
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
  fireEvent.change(screen.getByTestId("prompt-input"), {
    target: { value: "An idea" },
  });
}

describe("ProductCreationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScratchpadCreationStore.getState().reset();
    useScratchpadCreationStore.getState().openDialog();
    mockSagaRun.mockResolvedValue({
      success: true,
      data: {
        task: { id: "task-1" },
        workspace: {},
        scratchpadPath: "/sp",
        projectId: 42,
        initialPrompt: [{ type: "text", text: "scaffold" }],
      },
    });
    mockConnectToTask.mockResolvedValue(undefined);
  });

  afterEach(() => {
    useScratchpadCreationStore.getState().reset();
  });

  it("renders the framing banner, name field, prompt input and project radios", () => {
    renderDialog();
    expect(screen.getByText(/I'll ask up to/)).toBeInTheDocument();
    expect(
      screen.getByText(/of questions before scaffolding\./),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Uber for dogs")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-input")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Set up on publish later/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Use existing project/i)).toBeInTheDocument();
    expect(screen.getByTestId("model-selector")).toBeInTheDocument();
    expect(screen.getByTestId("reasoning-selector")).toBeInTheDocument();
  });

  it("submit with default 'later' mode passes no projectId", async () => {
    renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: /start building/i }));

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
  });

  it("submit with an existing project passes projectId", async () => {
    renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByLabelText(/Use existing project/i));
    fireEvent.click(screen.getByTestId("project-picker"));

    fireEvent.click(screen.getByRole("button", { name: /start building/i }));

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
  });

  it("submit is disabled when required fields are empty", () => {
    renderDialog();
    expect(
      screen.getByRole("button", { name: /start building/i }),
    ).toBeDisabled();
  });

  it("surfaces saga errors in the store and re-enables submit", async () => {
    mockSagaRun.mockResolvedValueOnce({
      success: false,
      error: "things broke",
      failedStep: "task_creation",
    });

    renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: /start building/i }));

    await waitFor(() => {
      expect(useScratchpadCreationStore.getState().lastError).toBe(
        "things broke",
      );
    });

    expect(useScratchpadCreationStore.getState().step).toBe("idle");
    expect(
      screen.getByRole("button", { name: /start building/i }),
    ).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("things broke");
  });
});
