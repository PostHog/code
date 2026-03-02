import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import type { ArchivedTask } from "@shared/types/archive";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ArchivedTasksViewPresentation,
  type ArchivedTaskWithDetails,
} from "./ArchivedTasksView";

function createArchivedTask(id: string, daysAgo: number): ArchivedTask {
  return {
    taskId: id,
    archivedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    folderId: "folder-1",
    mode: "worktree",
    worktreeName: "feature-wt",
    branchName: `feature/branch-${id}`,
    checkpointId: "checkpoint-123",
  };
}

function createTask(
  id: string,
  title: string,
  daysAgo: number,
  repo: string,
): Task {
  const now = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    id,
    task_number: null,
    slug: id,
    title,
    description: "",
    created_at: now,
    updated_at: now,
    origin_product: "twig",
    repository: `org/${repo}`,
  };
}

function createItem(
  id: string,
  title: string,
  daysAgo: number,
  repo: string,
): ArchivedTaskWithDetails {
  return {
    archived: createArchivedTask(id, daysAgo),
    task: createTask(id, title, daysAgo, repo),
  };
}

const sampleItems: ArchivedTaskWithDetails[] = [
  createItem("task-1", "Add dark mode support", 1, "frontend"),
  createItem("task-2", "Fix login redirect bug", 2, "backend"),
  createItem("task-3", "Refactor database queries", 7, "api-server"),
  createItem("task-4", "Update dependencies", 14, "monorepo"),
];

const meta: Meta<typeof ArchivedTasksViewPresentation> = {
  title: "Archive/ArchivedTasksView",
  component: ArchivedTasksViewPresentation,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Box style={{ width: "100%", height: "100vh" }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    items: sampleItems,
    isLoading: false,
    unarchivingId: null,
    branchNotFound: null,
    onBack: () => {},
    onUnarchive: () => {},
    onDelete: (_taskId: string, _taskTitle: string) => {},
    onContextMenu: () => {},
    onBranchNotFoundClose: () => {},
    onRecreateBranch: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ArchivedTasksViewPresentation>;

export const Default: Story = {};

export const Loading: Story = {
  args: { items: [], isLoading: true },
};

export const Empty: Story = {
  args: { items: [] },
};

export const Unarchiving: Story = {
  args: { unarchivingId: "task-2" },
};

export const BranchNotFoundDialog: Story = {
  args: {
    branchNotFound: { taskId: "task-1", branchName: "feature/dark-mode" },
  },
};

export const SingleTask: Story = {
  args: { items: [sampleItems[0]] },
};

export const ManyTasks: Story = {
  args: {
    items: [
      ...sampleItems,
      createItem("task-5", "Implement caching layer", 30, "cache"),
      createItem("task-6", "Add unit tests", 45, "testing"),
      createItem("task-7", "Setup CI/CD pipeline", 60, "devops"),
      createItem("task-8", "Migrate to TypeScript 5.0", 90, "core"),
    ],
  },
};

export const WithMissingTask: Story = {
  args: {
    items: [
      ...sampleItems,
      {
        archived: createArchivedTask("task-missing", 5),
        task: null,
      },
    ],
  },
};
