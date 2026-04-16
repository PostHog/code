import { describe, expect, it, vi } from "vitest";
import { PostHogAPIClient } from "./posthogClient";

describe("PostHogAPIClient", () => {
  it("sends supported reasoning effort for cloud Codex runs", async () => {
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    const post = vi.fn().mockResolvedValue({
      id: "task-123",
      title: "Task",
      description: "Task",
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-14T00:00:00Z",
      origin_product: "user_created",
    });

    (client as unknown as { api: { post: typeof post } }).api = { post };

    await client.runTaskInCloud("task-123", "feature/max-effort", {
      adapter: "codex",
      model: "gpt-5.4",
      reasoningLevel: "high",
    });

    expect(post).toHaveBeenCalledWith(
      "/api/projects/{project_id}/tasks/{id}/run/",
      expect.objectContaining({
        path: { project_id: "123", id: "task-123" },
        body: expect.objectContaining({
          mode: "interactive",
          branch: "feature/max-effort",
          runtime_adapter: "codex",
          model: "gpt-5.4",
          reasoning_effort: "high",
        }),
      }),
    );
  });

  it("preserves Codex-native permission modes for cloud runs", async () => {
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    const post = vi.fn().mockResolvedValue({
      id: "task-123",
      title: "Task",
      description: "Task",
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-14T00:00:00Z",
      origin_product: "user_created",
    });

    (client as unknown as { api: { post: typeof post } }).api = { post };

    await client.runTaskInCloud("task-123", "feature/codex-mode", {
      adapter: "codex",
      model: "gpt-5.4",
      initialPermissionMode: "auto",
    });

    expect(post).toHaveBeenCalledWith(
      "/api/projects/{project_id}/tasks/{id}/run/",
      expect.objectContaining({
        body: expect.objectContaining({
          initial_permission_mode: "auto",
        }),
      }),
    );
  });

  it("rejects unsupported reasoning effort for cloud Codex runs", async () => {
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    const post = vi.fn();
    (client as unknown as { api: { post: typeof post } }).api = { post };

    await expect(
      client.runTaskInCloud("task-123", "feature/max-effort", {
        adapter: "codex",
        model: "gpt-5.4",
        reasoningLevel: "max",
      }),
    ).rejects.toThrow(
      "Reasoning effort 'max' is not supported for codex model 'gpt-5.4'.",
    );

    expect(post).not.toHaveBeenCalled();
  });

  it("rejects unsupported minimal reasoning effort for cloud runs", async () => {
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    const post = vi.fn();
    (client as unknown as { api: { post: typeof post } }).api = { post };

    await expect(
      client.runTaskInCloud("task-123", "feature/legacy-effort", {
        adapter: "claude",
        model: "claude-opus-4-6",
        reasoningLevel: "minimal",
      }),
    ).rejects.toThrow(
      "Reasoning effort 'minimal' is not supported for claude model 'claude-opus-4-6'.",
    );

    expect(post).not.toHaveBeenCalled();
  });
});
