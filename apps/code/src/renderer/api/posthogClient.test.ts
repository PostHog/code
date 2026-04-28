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

  it("creates cloud task runs without relying on generated request typing", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "run-123", environment: "cloud" }),
    });
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    (
      client as unknown as {
        api: { baseUrl: string; fetcher: { fetch: typeof fetch } };
      }
    ).api = {
      baseUrl: "http://localhost:8000",
      fetcher: { fetch },
    };

    await expect(
      client.createTaskRun("task-123", {
        environment: "cloud",
        mode: "interactive",
        branch: "feature/direct-upload",
        adapter: "codex",
        model: "gpt-5.4",
        reasoningLevel: "high",
        initialPermissionMode: "auto",
      }),
    ).resolves.toEqual({ id: "run-123", environment: "cloud" });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        path: "/api/projects/123/tasks/task-123/runs/",
        overrides: {
          body: JSON.stringify({
            mode: "interactive",
            branch: "feature/direct-upload",
            runtime_adapter: "codex",
            model: "gpt-5.4",
            reasoning_effort: "high",
            initial_permission_mode: "auto",
            environment: "cloud",
          }),
        },
      }),
    );
  });

  it("starts an existing cloud task run with run-scoped artifact ids", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-123", latest_run: { id: "run-123" } }),
    });
    const client = new PostHogAPIClient(
      "http://localhost:8000",
      async () => "token",
      async () => "token",
      123,
    );

    (
      client as unknown as {
        api: { baseUrl: string; fetcher: { fetch: typeof fetch } };
      }
    ).api = {
      baseUrl: "http://localhost:8000",
      fetcher: { fetch },
    };

    await expect(
      client.startTaskRun("task-123", "run-123", {
        pendingUserMessage: "Read the attached file first",
        pendingUserArtifactIds: ["artifact-1"],
      }),
    ).resolves.toEqual({ id: "task-123", latest_run: { id: "run-123" } });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        path: "/api/projects/123/tasks/task-123/runs/run-123/start/",
        overrides: {
          body: JSON.stringify({
            pending_user_message: "Read the attached file first",
            pending_user_artifact_ids: ["artifact-1"],
          }),
        },
      }),
    );
  });

  describe("getSignalReport", () => {
    function makeClient(fetch: ReturnType<typeof vi.fn>) {
      const client = new PostHogAPIClient(
        "http://localhost:8000",
        async () => "token",
        async () => "token",
        123,
      );
      (
        client as unknown as {
          api: { baseUrl: string; fetcher: { fetch: typeof fetch } };
        }
      ).api = {
        baseUrl: "http://localhost:8000",
        fetcher: { fetch },
      };
      return client;
    }

    it("returns the parsed report on success", async () => {
      const fetch = vi.fn().mockResolvedValue({
        json: async () => ({ id: "abc", title: "hi" }),
      });
      const client = makeClient(fetch);

      await expect(client.getSignalReport("abc")).resolves.toEqual({
        id: "abc",
        title: "hi",
      });
    });

    it("returns null when the shared fetcher throws a 404", async () => {
      const fetch = vi
        .fn()
        .mockRejectedValue(
          new Error('Failed request: [404] {"detail":"Not found."}'),
        );
      const client = makeClient(fetch);

      await expect(client.getSignalReport("abc")).resolves.toBeNull();
    });

    it("returns null when the shared fetcher throws a 403", async () => {
      const fetch = vi
        .fn()
        .mockRejectedValue(
          new Error('Failed request: [403] {"detail":"Forbidden."}'),
        );
      const client = makeClient(fetch);

      await expect(client.getSignalReport("abc")).resolves.toBeNull();
    });

    it("rethrows non-404/403 errors", async () => {
      const fetch = vi
        .fn()
        .mockRejectedValue(new Error("Failed request: [500] boom"));
      const client = makeClient(fetch);

      await expect(client.getSignalReport("abc")).rejects.toThrow("[500]");
    });
  });
});
