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
import { NewTaskLinkEvent, NewTaskLinkService } from "./service";

function makeDeepLinkService() {
  const handlers = new Map<string, DeepLinkHandler>();
  const service = {
    registerHandler: vi.fn((key: string, handler: DeepLinkHandler) => {
      handlers.set(key, handler);
    }),
    trigger: (key: string, query: string) => {
      const handler = handlers.get(key);
      if (!handler) throw new Error(`No handler for ${key}`);
      return handler("", new URLSearchParams(query));
    },
  };
  return service as unknown as DeepLinkService & {
    trigger: (key: string, query: string) => boolean;
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

describe("NewTaskLinkService", () => {
  let deepLinkService: ReturnType<typeof makeDeepLinkService>;
  let mainWindow: ReturnType<typeof makeMainWindow>;
  let service: NewTaskLinkService;

  beforeEach(() => {
    deepLinkService = makeDeepLinkService();
    mainWindow = makeMainWindow();
    service = new NewTaskLinkService(deepLinkService, mainWindow);
  });

  it("registers a 'new' handler on the DeepLinkService", () => {
    expect(deepLinkService.registerHandler).toHaveBeenCalledWith(
      "new",
      expect.any(Function),
    );
  });

  it("emits OpenNewTask with parsed payload when a listener is attached", () => {
    const listener = vi.fn();
    service.on(NewTaskLinkEvent.OpenNewTask, listener);

    const result = deepLinkService.trigger(
      "new",
      "prompt=fix%20the%20bug&repo=/path/to/repo&adapter=claude&mode=worktree&model=claude-opus-4-7&effort=high&branch=main&auto=1",
    );

    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledWith({
      prompt: "fix the bug",
      repo: "/path/to/repo",
      adapter: "claude",
      mode: "worktree",
      model: "claude-opus-4-7",
      effort: "high",
      branch: "main",
      auto: true,
    });
  });

  it("queues a pending deep link when no listener is attached", () => {
    deepLinkService.trigger("new", "prompt=do%20stuff&repo=/x");

    const pending = service.consumePendingDeepLink();
    expect(pending).toMatchObject({
      prompt: "do stuff",
      repo: "/x",
      auto: false,
    });

    expect(service.consumePendingDeepLink()).toBeNull();
  });

  it("returns false and does not emit when prompt is missing", () => {
    const listener = vi.fn();
    service.on(NewTaskLinkEvent.OpenNewTask, listener);

    const result = deepLinkService.trigger("new", "repo=/x");

    expect(result).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns false and does not emit when prompt is whitespace only", () => {
    const listener = vi.fn();
    service.on(NewTaskLinkEvent.OpenNewTask, listener);

    const result = deepLinkService.trigger("new", "prompt=%20%20%20");

    expect(result).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("drops invalid enum values without failing the request", () => {
    const listener = vi.fn();
    service.on(NewTaskLinkEvent.OpenNewTask, listener);

    const result = deepLinkService.trigger(
      "new",
      "prompt=hi&adapter=invalid&mode=junk&effort=zzz",
    );

    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "hi",
        adapter: undefined,
        mode: undefined,
        effort: undefined,
      }),
    );
  });

  it.each([
    ["1", true],
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["0", false],
    ["false", false],
    ["", false],
  ])("parses auto=%s as %s", (rawValue, expected) => {
    const listener = vi.fn();
    service.on(NewTaskLinkEvent.OpenNewTask, listener);

    const query = rawValue
      ? `prompt=hi&auto=${encodeURIComponent(rawValue)}`
      : "prompt=hi";

    deepLinkService.trigger("new", query);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ auto: expected }),
    );
  });

  it("focuses the main window on link arrival", () => {
    deepLinkService.trigger("new", "prompt=hi");

    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.restore).not.toHaveBeenCalled();
  });

  it("restores the main window when it is minimized", () => {
    mainWindow.isMinimized.mockReturnValue(true);

    deepLinkService.trigger("new", "prompt=hi");

    expect(mainWindow.restore).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  it("does not focus the window when prompt is missing", () => {
    deepLinkService.trigger("new", "repo=/x");

    expect(mainWindow.focus).not.toHaveBeenCalled();
    expect(mainWindow.restore).not.toHaveBeenCalled();
  });
});
