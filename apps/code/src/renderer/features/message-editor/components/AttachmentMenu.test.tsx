import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectFiles = vi.hoisted(() => vi.fn());

vi.mock("@posthog/quill", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuTrigger: ({ render }: { render: React.ReactElement }) => render,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    title,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
  Combobox: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ComboboxContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxInput: () => <input type="text" />,
  ComboboxItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxList: () => null,
}));

vi.mock("@renderer/trpc/client", () => ({
  trpcClient: {
    os: {
      selectFiles: {
        query: mockSelectFiles,
      },
    },
  },
  useTRPC: () => ({
    git: {
      getGhStatus: {
        queryOptions: () => ({}),
      },
      searchGithubIssues: {
        queryOptions: () => ({}),
      },
    },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock("@renderer/utils/toast", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { AttachmentMenu } from "./AttachmentMenu";

describe("AttachmentMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds attachments using absolute file paths from the OS picker", async () => {
    const user = userEvent.setup();
    const onAddAttachment = vi.fn();

    mockSelectFiles.mockResolvedValue(["/tmp/demo/test.txt"]);

    render(
      <Theme>
        <AttachmentMenu
          onAddAttachment={onAddAttachment}
          onInsertChip={vi.fn()}
        />
      </Theme>,
    );

    await user.click(screen.getByText("Add file"));

    expect(mockSelectFiles).toHaveBeenCalledOnce();
    expect(onAddAttachment).toHaveBeenCalledWith({
      id: "/tmp/demo/test.txt",
      label: "test.txt",
    });
  });
});
