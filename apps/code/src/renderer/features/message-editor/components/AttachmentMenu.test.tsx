import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectFiles = vi.hoisted(() => vi.fn());

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

    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Add file"));

    expect(mockSelectFiles).toHaveBeenCalledOnce();
    expect(onAddAttachment).toHaveBeenCalledWith({
      id: "/tmp/demo/test.txt",
      label: "test.txt",
    });
  });
});
