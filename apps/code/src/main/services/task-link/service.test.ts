import type { IMainWindow } from "@posthog/platform/main-window";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import type { DeepLinkHandler, DeepLinkService } from "../deep-link/service";
import { TaskLinkEvent, TaskLinkService } from "./service";

function makeDeepLinkService() {
  const handlers = new Map<string, DeepLinkHandler>();
  const service = {
    registerHandler: vi.fn((key: string, handler: DeepLinkHandler) => {
      handlers.set(key, handler);
    }),
    trigger: (key: string, path: string, query?: string) => {
      const handler = handlers.get(key);
      if (!handler) throw new Error(`No handler for ${key}`);
      return handler(path, new URLSearchParams(query ?? ""));
    },
  };
  return service as unknown as DeepLinkService & {
    trigger: (key: string, path: string, query?: string) => boolean;
  };
}

function makeMainWindow() {
  return {
    focus: vi.fn(),
    restore: vi.fn(),
    isMinimized: vi.fn().mockReturnValue(false),
  } as unknown as IMainWindow & {
    focus: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
  };
}

describe("TaskLinkService", () => {
  let deepLinkService: ReturnType<typeof makeDeepLinkService>;
  let mainWindow: ReturnType<typeof makeMainWindow>;
  let service: TaskLinkService;

  beforeEach(() => {
    deepLinkService = makeDeepLinkService();
    mainWindow = makeMainWindow();
    service = new TaskLinkService(deepLinkService, mainWindow);
  });

  describe("task handler", () => {
    it("registers a 'task' handler on the DeepLinkService", () => {
      expect(deepLinkService.registerHandler).toHaveBeenCalledWith(
        "task",
        expect.any(Function),
      );
    });

    it("emits OpenTask with just a task id", () => {
      const listener = vi.fn();
      service.on(TaskLinkEvent.OpenTask, listener);

      const result = deepLinkService.trigger("task", "abc-123");

      expect(result).toBe(true);
      expect(listener).toHaveBeenCalledWith({
        taskId: "abc-123",
        taskRunId: undefined,
      });
    });

    it("parses /run/<id> into taskRunId", () => {
      const listener = vi.fn();
      service.on(TaskLinkEvent.OpenTask, listener);

      deepLinkService.trigger("task", "abc-123/run/xyz-789");

      expect(listener).toHaveBeenCalledWith({
        taskId: "abc-123",
        taskRunId: "xyz-789",
      });
    });

    it("queues a pending deep link when no listener is attached", () => {
      deepLinkService.trigger("task", "abc-123/run/xyz-789");

      expect(service.consumePendingDeepLink()).toEqual({
        taskId: "abc-123",
        taskRunId: "xyz-789",
      });
      expect(service.consumePendingDeepLink()).toBeNull();
    });

    it("returns false when path is empty", () => {
      const result = deepLinkService.trigger("task", "");
      expect(result).toBe(false);
    });
  });

  describe("new task handler", () => {
    it("registers a 'new' handler on the DeepLinkService", () => {
      expect(deepLinkService.registerHandler).toHaveBeenCalledWith(
        "new",
        expect.any(Function),
      );
    });

    it("emits CreateTask with the prompt query param", () => {
      const listener = vi.fn();
      service.on(TaskLinkEvent.CreateTask, listener);

      const result = deepLinkService.trigger(
        "new",
        "",
        "prompt=fix%20the%20bug",
      );

      expect(result).toBe(true);
      expect(listener).toHaveBeenCalledWith({ prompt: "fix the bug" });
    });

    it("emits CreateTask with no prompt when query is empty", () => {
      const listener = vi.fn();
      service.on(TaskLinkEvent.CreateTask, listener);

      deepLinkService.trigger("new", "");

      expect(listener).toHaveBeenCalledWith({ prompt: undefined });
    });

    it("treats whitespace-only prompts as undefined", () => {
      const listener = vi.fn();
      service.on(TaskLinkEvent.CreateTask, listener);

      deepLinkService.trigger("new", "", "prompt=%20%20%20");

      expect(listener).toHaveBeenCalledWith({ prompt: undefined });
    });

    it("queues a pending new-task link when no listener is attached", () => {
      deepLinkService.trigger("new", "", "prompt=hello");

      expect(service.consumePendingNewTaskDeepLink()).toEqual({
        prompt: "hello",
      });
      expect(service.consumePendingNewTaskDeepLink()).toBeNull();
    });

    it("focuses the main window", () => {
      deepLinkService.trigger("new", "", "prompt=hello");

      expect(mainWindow.focus).toHaveBeenCalledTimes(1);
      expect(mainWindow.restore).not.toHaveBeenCalled();
    });

    it("restores the main window when minimized", () => {
      mainWindow.isMinimized.mockReturnValue(true);

      deepLinkService.trigger("new", "");

      expect(mainWindow.restore).toHaveBeenCalledTimes(1);
      expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    });
  });
});
