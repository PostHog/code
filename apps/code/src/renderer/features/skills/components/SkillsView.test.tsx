import { Theme } from "@radix-ui/themes";
import type { SkillInfo } from "@shared/types/skills";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const mockSkills: SkillInfo[] = [
  {
    name: "Test Skill",
    description: "A test skill",
    source: "bundled",
    path: "/skills/test-skill",
  },
  {
    name: "Another Skill",
    description: "Another one",
    source: "user",
    path: "/skills/another-skill",
  },
];

const mockQueryOptions = vi.fn(() => ({ queryKey: ["skills"] }));

vi.mock("@renderer/trpc", () => ({
  useTRPC: () => ({
    skills: {
      list: {
        queryOptions: mockQueryOptions,
      },
    },
    fs: {
      readAbsoluteFile: {
        queryOptions: vi.fn(() => ({ queryKey: ["fs"] })),
      },
    },
  }),
}));

let skillsData: SkillInfo[] = mockSkills;
let skillsLoading = false;

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: skillsData,
      isLoading: skillsLoading,
    })),
  };
});

vi.mock("@hooks/useSetHeaderContent", () => ({
  useSetHeaderContent: vi.fn(),
}));

vi.mock("@components/ResizableSidebar", () => ({
  ResizableSidebar: vi.fn(({ open, children }) => (
    <div data-testid="resizable-sidebar" data-open={open}>
      {open ? children : null}
    </div>
  )),
}));

vi.mock("./SkillCard", () => ({
  SOURCE_CONFIG: {
    user: { icon: () => null, label: "User", sectionTitle: "Your skills" },
    bundled: {
      icon: () => null,
      label: "PostHog Code",
      sectionTitle: "PostHog Code",
    },
    repo: { icon: () => null, label: "Repo", sectionTitle: "Repository" },
    marketplace: {
      icon: () => null,
      label: "Marketplace",
      sectionTitle: "Marketplace",
    },
  },
  SkillSection: vi.fn(({ skills, selectedPath, onSelect }) => (
    <div data-testid="skill-section">
      {skills.map((skill: SkillInfo) => (
        <button
          type="button"
          key={skill.path}
          data-testid={`skill-card-${skill.name}`}
          data-selected={selectedPath === skill.path}
          onClick={() => onSelect(skill.path)}
        >
          {skill.name}
        </button>
      ))}
    </div>
  )),
}));

vi.mock("./SkillDetailPanel", () => ({
  SkillDetailPanel: vi.fn(({ skill, onClose }) => (
    <div data-testid="skill-detail-panel">
      <span>{skill.name}</span>
      <button type="button" data-testid="close-button" onClick={onClose}>
        Close
      </button>
    </div>
  )),
}));

vi.mock("../stores/skillsSidebarStore", () => ({
  useSkillsSidebarStore: () => ({
    width: 380,
    setWidth: vi.fn(),
    isResizing: false,
    setIsResizing: vi.fn(),
  }),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// --- Helpers ---

function renderSkillsView(ui: ReactElement = <SkillsView />) {
  return render(<Theme>{ui}</Theme>);
}

// --- Tests ---

const { SkillsView } = await import("./SkillsView");

describe("SkillsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skillsData = [...mockSkills];
    skillsLoading = false;
  });

  it("does not show detail panel when no skill is selected", () => {
    renderSkillsView();

    const sidebar = screen.getByTestId("resizable-sidebar");
    expect(sidebar).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("skill-detail-panel")).not.toBeInTheDocument();
  });

  it("opens detail panel when a skill card is clicked", async () => {
    const user = userEvent.setup();
    renderSkillsView();

    await user.click(screen.getByTestId("skill-card-Test Skill"));

    const sidebar = screen.getByTestId("resizable-sidebar");
    expect(sidebar).toHaveAttribute("data-open", "true");
    const panel = screen.getByTestId("skill-detail-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("Test Skill")).toBeInTheDocument();
  });

  it("closes detail panel when close button is clicked", async () => {
    const user = userEvent.setup();
    renderSkillsView();

    // Open the detail panel first
    await user.click(screen.getByTestId("skill-card-Test Skill"));
    expect(screen.getByTestId("skill-detail-panel")).toBeInTheDocument();

    // Click the close button
    await user.click(screen.getByTestId("close-button"));

    // Sidebar should be closed now
    const sidebar = screen.getByTestId("resizable-sidebar");
    expect(sidebar).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("skill-detail-panel")).not.toBeInTheDocument();
  });

  it("toggles detail panel when clicking the same skill card twice", async () => {
    const user = userEvent.setup();
    renderSkillsView();

    // Click to select
    await user.click(screen.getByTestId("skill-card-Test Skill"));
    expect(screen.getByTestId("skill-detail-panel")).toBeInTheDocument();

    // Click same card again to deselect
    await user.click(screen.getByTestId("skill-card-Test Skill"));

    const sidebar = screen.getByTestId("resizable-sidebar");
    expect(sidebar).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("skill-detail-panel")).not.toBeInTheDocument();
  });

  it("switches detail panel when clicking a different skill", async () => {
    const user = userEvent.setup();
    renderSkillsView();

    await user.click(screen.getByTestId("skill-card-Test Skill"));
    const panel1 = screen.getByTestId("skill-detail-panel");
    expect(within(panel1).getByText("Test Skill")).toBeInTheDocument();

    await user.click(screen.getByTestId("skill-card-Another Skill"));
    const panel2 = screen.getByTestId("skill-detail-panel");
    expect(within(panel2).getByText("Another Skill")).toBeInTheDocument();

    // Sidebar should remain open
    const sidebar = screen.getByTestId("resizable-sidebar");
    expect(sidebar).toHaveAttribute("data-open", "true");
  });
});
