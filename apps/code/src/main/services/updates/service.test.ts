import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatesEvent } from "./schemas.js";

// Use vi.hoisted to ensure mocks are available when vi.mock is hoisted
const { mockApp, mockAutoUpdater, mockLifecycleService } = vi.hoisted(() => ({
  mockAutoUpdater: {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
  mockApp: {
    isPackaged: true,
    getVersion: vi.fn(() => "1.0.0"),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  mockLifecycleService: {
    shutdown: vi.fn(() => Promise.resolve()),
    shutdownWithoutContainer: vi.fn(() => Promise.resolve()),
    setQuittingForUpdate: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: mockApp,
  autoUpdater: mockAutoUpdater,
}));

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

vi.mock("../../di/tokens.js", () => ({
  MAIN_TOKENS: {
    AppLifecycleService: Symbol.for("AppLifecycleService"),
  },
}));

// Import the service after mocks are set up
import { UpdatesService } from "./service.js";

// Helper to initialize service and wait for setup without running the periodic interval infinitely
async function initializeService(service: UpdatesService): Promise<void> {
  service.init();
  // Allow the whenReady promise microtask to resolve
  await vi.advanceTimersByTimeAsync(0);
}

describe("UpdatesService", () => {
  let service: UpdatesService;
  let originalPlatform: PropertyDescriptor | undefined;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Store original values
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    originalEnv = { ...process.env };

    // Reset mocks to default state
    mockApp.isPackaged = true;
    mockApp.getVersion.mockReturnValue("1.0.0");
    mockApp.on.mockClear();
    mockApp.whenReady.mockResolvedValue(undefined);

    // Set default platform to darwin (macOS)
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    // Clear env flag
    delete process.env.ELECTRON_DISABLE_AUTO_UPDATE;

    service = new UpdatesService();
    // Manually inject the mock lifecycle service (normally done by DI container)
    (
      service as unknown as { lifecycleService: typeof mockLifecycleService }
    ).lifecycleService = mockLifecycleService;
  });

  afterEach(() => {
    vi.useRealTimers();

    // Restore original values
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    process.env = originalEnv;
  });

  describe("isEnabled", () => {
    it("returns true when app is packaged on macOS", () => {
      mockApp.isPackaged = true;
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(true);
    });

    it("returns true when app is packaged on Windows", () => {
      mockApp.isPackaged = true;
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(true);
    });

    it("returns false when app is not packaged", () => {
      mockApp.isPackaged = false;

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(false);
    });

    it("returns false when ELECTRON_DISABLE_AUTO_UPDATE is set", () => {
      mockApp.isPackaged = true;
      process.env.ELECTRON_DISABLE_AUTO_UPDATE = "1";

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(false);
    });

    it("returns false on Linux", () => {
      mockApp.isPackaged = true;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(false);
    });

    it("returns false on unsupported platforms", () => {
      mockApp.isPackaged = true;
      Object.defineProperty(process, "platform", {
        value: "freebsd",
        configurable: true,
      });

      const newService = new UpdatesService();
      expect(newService.isEnabled).toBe(false);
    });
  });

  describe("init", () => {
    it("sets up auto updater when enabled", async () => {
      await initializeService(service);

      expect(mockApp.on).toHaveBeenCalledWith(
        "browser-window-focus",
        expect.any(Function),
      );
      expect(mockApp.whenReady).toHaveBeenCalled();
    });

    it("does not set up auto updater when disabled via env flag", () => {
      process.env.ELECTRON_DISABLE_AUTO_UPDATE = "1";

      const newService = new UpdatesService();
      newService.init();

      expect(mockApp.whenReady).not.toHaveBeenCalled();
    });

    it("does not set up auto updater on unsupported platform", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const newService = new UpdatesService();
      newService.init();

      expect(mockApp.whenReady).not.toHaveBeenCalled();
    });

    it("prevents multiple initializations", async () => {
      await initializeService(service);

      const firstCallCount = mockAutoUpdater.setFeedURL.mock.calls.length;

      // Simulate whenReady resolving again (shouldn't happen, but testing guard)
      await initializeService(service);

      // setFeedURL should not be called again
      expect(mockAutoUpdater.setFeedURL.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe("feedUrl", () => {
    it("constructs correct feed URL with platform, arch, and version", async () => {
      Object.defineProperty(process, "arch", {
        value: "arm64",
        configurable: true,
      });
      mockApp.getVersion.mockReturnValue("2.0.0");

      await initializeService(service);

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        url: "https://update.electronjs.org/PostHog/Twig/darwin-arm64/2.0.0",
      });
    });
  });

  describe("checkForUpdates", () => {
    it("returns success when updates are enabled", () => {
      const result = service.checkForUpdates();
      expect(result).toEqual({ success: true });
    });

    it("returns error when updates are disabled (not packaged)", () => {
      mockApp.isPackaged = false;

      const newService = new UpdatesService();
      const result = newService.checkForUpdates();

      expect(result).toEqual({
        success: false,
        errorMessage: "Updates only available in packaged builds",
        errorCode: "disabled",
      });
    });

    it("returns error when updates are disabled (unsupported platform)", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const newService = new UpdatesService();
      const result = newService.checkForUpdates();

      expect(result).toEqual({
        success: false,
        errorMessage: "Auto updates only supported on macOS and Windows",
        errorCode: "disabled",
      });
    });

    it("returns error when already checking for updates", () => {
      // First call starts the check
      service.checkForUpdates();

      // Second call should fail
      const result = service.checkForUpdates();
      expect(result).toEqual({
        success: false,
        errorMessage: "Already checking for updates",
        errorCode: "already_checking",
      });
    });

    it("emits status event when checking starts", () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      service.checkForUpdates();

      expect(statusHandler).toHaveBeenCalledWith({ checking: true });
    });

    it("calls autoUpdater.checkForUpdates", async () => {
      await initializeService(service);

      // Complete the initial check triggered by setupAutoUpdater
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];
      if (notAvailableHandler) {
        notAvailableHandler();
      }

      mockAutoUpdater.checkForUpdates.mockClear();
      service.checkForUpdates();

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("allows retry after previous check completes", async () => {
      await initializeService(service);

      // Complete the initial check triggered by setupAutoUpdater
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];

      if (notAvailableHandler) {
        notAvailableHandler();
      }

      // First explicit check
      const result1 = service.checkForUpdates();
      expect(result1.success).toBe(true);

      // Simulate completion
      if (notAvailableHandler) {
        notAvailableHandler();
      }

      // Second check should succeed
      const result2 = service.checkForUpdates();
      expect(result2.success).toBe(true);
    });
  });

  describe("hasUpdateReady", () => {
    it("returns false initially", () => {
      expect(service.hasUpdateReady).toBe(false);
    });

    it("returns true after an update is downloaded", async () => {
      await initializeService(service);

      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];

      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      expect(service.hasUpdateReady).toBe(true);
    });
  });

  describe("installUpdate", () => {
    it("returns false when no update is ready", async () => {
      const result = await service.installUpdate();
      expect(result).toEqual({ installed: false });
    });

    it("calls quitAndInstall when update is ready", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const updateDownloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];

      if (updateDownloadedHandler) {
        updateDownloadedHandler({}, "Release notes", "v2.0.0");
      }

      const resultPromise = service.installUpdate();
      await vi.runOnlyPendingTimersAsync();
      const result = await resultPromise;
      expect(result).toEqual({ installed: true });

      // Verify setQuittingForUpdate is called first
      expect(mockLifecycleService.setQuittingForUpdate).toHaveBeenCalled();

      // Verify shutdownWithoutContainer is called (not full shutdown)
      expect(mockLifecycleService.shutdownWithoutContainer).toHaveBeenCalled();
      expect(mockLifecycleService.shutdown).not.toHaveBeenCalled();

      // Verify quitAndInstall is called after cleanup
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();

      // Verify order: setQuittingForUpdate -> shutdownWithoutContainer -> quitAndInstall
      const setQuittingOrder =
        mockLifecycleService.setQuittingForUpdate.mock.invocationCallOrder[0];
      const cleanupOrder =
        mockLifecycleService.shutdownWithoutContainer.mock
          .invocationCallOrder[0];
      const quitAndInstallOrder =
        mockAutoUpdater.quitAndInstall.mock.invocationCallOrder[0];

      expect(setQuittingOrder).toBeLessThan(cleanupOrder);
      expect(cleanupOrder).toBeLessThan(quitAndInstallOrder);
    });

    it("returns false if quitAndInstall throws", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const updateDownloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];

      if (updateDownloadedHandler) {
        updateDownloadedHandler({}, "Release notes", "v2.0.0");
      }

      mockAutoUpdater.quitAndInstall.mockImplementation(() => {
        throw new Error("Failed to install");
      });

      const resultPromise = service.installUpdate();
      await vi.runOnlyPendingTimersAsync();
      const result = await resultPromise;
      expect(result).toEqual({ installed: false });
    });
  });

  describe("triggerMenuCheck", () => {
    it("emits CheckFromMenu event", () => {
      const handler = vi.fn();
      service.on(UpdatesEvent.CheckFromMenu, handler);

      service.triggerMenuCheck();

      expect(handler).toHaveBeenCalledWith(true);
    });
  });

  describe("autoUpdater event handling", () => {
    beforeEach(async () => {
      await initializeService(service);
    });

    it("registers all required event handlers", () => {
      const registeredEvents = mockAutoUpdater.on.mock.calls.map(
        ([event]) => event,
      );

      expect(registeredEvents).toContain("error");
      expect(registeredEvents).toContain("checking-for-update");
      expect(registeredEvents).toContain("update-available");
      expect(registeredEvents).toContain("update-not-available");
      expect(registeredEvents).toContain("update-downloaded");
    });

    it("handles update-not-available event", () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      // Start a check
      service.checkForUpdates();
      statusHandler.mockClear();

      // Simulate no update available
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];

      if (notAvailableHandler) {
        notAvailableHandler();
      }

      expect(statusHandler).toHaveBeenCalledWith({
        checking: false,
        upToDate: true,
        version: "1.0.0",
      });
    });

    it("shows update-ready notification instead of up-to-date when update is already downloaded", () => {
      // Simulate update already downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      const statusHandler = vi.fn();
      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);
      service.on(UpdatesEvent.Ready, readyHandler);

      // Start a periodic re-check
      service.checkForUpdates("periodic");
      statusHandler.mockClear();

      // Server says no new update available
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];
      if (notAvailableHandler) {
        notAvailableHandler();
      }

      // Should emit checking: false (not upToDate)
      expect(statusHandler).toHaveBeenCalledWith({ checking: false });
      expect(statusHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ upToDate: true }),
      );

      // Should re-surface the downloaded update notification
      expect(readyHandler).toHaveBeenCalledWith({ version: "v2.0.0" });
    });

    it("handles update-downloaded event with version info", () => {
      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Ready, readyHandler);

      // Simulate update downloaded with version
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];

      if (downloadedHandler) {
        downloadedHandler({}, "Release notes here", "v2.0.0");
      }

      expect(readyHandler).toHaveBeenCalledWith({ version: "v2.0.0" });
    });

    it("handles error event and emits status with error", () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      // Start a check
      service.checkForUpdates();
      statusHandler.mockClear();

      // Simulate error
      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "error",
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error("Network error"));
      }

      expect(statusHandler).toHaveBeenCalledWith({
        checking: false,
        error: "Network error",
      });
    });

    it("handles error event gracefully when not checking", () => {
      // Complete the initial check triggered by setupAutoUpdater so we're not in checking state
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];
      if (notAvailableHandler) {
        notAvailableHandler();
      }

      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      // Simulate error without starting a check
      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "error",
      )?.[1];

      expect(() => {
        if (errorHandler) {
          errorHandler(new Error("Test error"));
        }
      }).not.toThrow();

      // Should not emit status since we weren't checking
      expect(statusHandler).not.toHaveBeenCalled();
    });
  });

  describe("check timeout", () => {
    beforeEach(async () => {
      await initializeService(service);
    });

    it("times out after 60 seconds if no response", async () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      service.checkForUpdates();
      statusHandler.mockClear();

      // Advance 60 seconds
      await vi.advanceTimersByTimeAsync(60 * 1000);

      expect(statusHandler).toHaveBeenCalledWith({
        checking: false,
        error: "Update check timed out. Please try again.",
      });
    });

    it("clears timeout when update-not-available fires", async () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      service.checkForUpdates();
      statusHandler.mockClear();

      // Simulate response before timeout
      const notAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-not-available",
      )?.[1];

      if (notAvailableHandler) {
        notAvailableHandler();
      }

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(60 * 1000);

      // Should only have received the upToDate status, not a timeout
      expect(statusHandler).toHaveBeenCalledTimes(1);
      expect(statusHandler).toHaveBeenCalledWith({
        checking: false,
        upToDate: true,
        version: "1.0.0",
      });
    });

    it("clears timeout when error fires", async () => {
      const statusHandler = vi.fn();
      service.on(UpdatesEvent.Status, statusHandler);

      service.checkForUpdates();
      statusHandler.mockClear();

      // Simulate error before timeout
      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "error",
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error("Network error"));
      }

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(60 * 1000);

      // Should only have received the error status, not a timeout
      expect(statusHandler).toHaveBeenCalledTimes(1);
      expect(statusHandler).toHaveBeenCalledWith({
        checking: false,
        error: "Network error",
      });
    });
  });

  describe("flushPendingNotification", () => {
    it("emits Ready event on window focus when update is pending", async () => {
      await initializeService(service);

      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Ready, readyHandler);

      // Simulate update downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];

      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      // First Ready event from handleUpdateDownloaded
      expect(readyHandler).toHaveBeenCalledTimes(1);

      // Get the browser-window-focus callback and call it
      const focusCallback = mockApp.on.mock.calls.find(
        ([event]) => event === "browser-window-focus",
      )?.[1];

      // Reset the handler count
      readyHandler.mockClear();

      // Pending notification should be false now, so no second emit
      if (focusCallback) {
        focusCallback();
      }

      expect(readyHandler).not.toHaveBeenCalled();
    });
  });

  describe("periodic update checks", () => {
    it("performs initial check on setup", async () => {
      await initializeService(service);

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("performs check every hour", async () => {
      await initializeService(service);

      const initialCallCount =
        mockAutoUpdater.checkForUpdates.mock.calls.length;

      // Advance 1 hour
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(mockAutoUpdater.checkForUpdates.mock.calls.length).toBe(
        initialCallCount + 1,
      );

      // Advance another hour
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(mockAutoUpdater.checkForUpdates.mock.calls.length).toBe(
        initialCallCount + 2,
      );
    });
  });

  describe("periodic check re-checks when update already downloaded", () => {
    it("re-checks for newer versions on periodic check when update is ready", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      // Clear the checkForUpdates calls from initialization
      mockAutoUpdater.checkForUpdates.mockClear();

      // Periodic check should re-check without resetting existing update state
      const result = service.checkForUpdates("periodic");
      expect(result).toEqual({ success: true });
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
      // Update should still be ready (state not reset)
      expect(service.hasUpdateReady).toBe(true);
    });

    it("user check still shows existing notification when update is ready", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Ready, readyHandler);

      // User check should show existing notification, not re-check
      mockAutoUpdater.checkForUpdates.mockClear();
      const result = service.checkForUpdates("user");
      expect(result).toEqual({ success: true });
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
      expect(readyHandler).toHaveBeenCalledWith({ version: "v2.0.0" });
    });

    it("preserves downloaded update when periodic re-check errors", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      // Periodic check proceeds
      service.checkForUpdates("periodic");

      // Simulate error during re-check
      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "error",
      )?.[1];
      if (errorHandler) {
        errorHandler(new Error("Network error"));
      }

      // Update should still be ready
      expect(service.hasUpdateReady).toBe(true);
    });

    it("does not re-notify when same version is re-downloaded after periodic check", async () => {
      await initializeService(service);

      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Ready, readyHandler);

      // First download of v2.0.0
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }
      expect(readyHandler).toHaveBeenCalledTimes(1);

      // Periodic check resets and re-downloads same version
      service.checkForUpdates("periodic");
      readyHandler.mockClear();

      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      // Should NOT re-notify since same version
      expect(readyHandler).not.toHaveBeenCalled();
    });

    it("returns already_checking when periodic check fires during in-flight check", async () => {
      await initializeService(service);

      // Simulate update downloaded
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }

      // First periodic check starts (sets checkingForUpdates = true)
      service.checkForUpdates("periodic");

      // Second periodic check while first is still in-flight
      const result = service.checkForUpdates("periodic");
      expect(result).toEqual({
        success: false,
        errorMessage: "Already checking for updates",
        errorCode: "already_checking",
      });

      // Update should still be ready (state not corrupted)
      expect(service.hasUpdateReady).toBe(true);
    });

    it("notifies when a newer version is downloaded after periodic check", async () => {
      await initializeService(service);

      const readyHandler = vi.fn();
      service.on(UpdatesEvent.Ready, readyHandler);

      // First download of v2.0.0
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        ([event]) => event === "update-downloaded",
      )?.[1];
      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v2.0.0");
      }
      expect(readyHandler).toHaveBeenCalledTimes(1);

      // Periodic check resets and downloads newer v3.0.0
      service.checkForUpdates("periodic");
      readyHandler.mockClear();

      if (downloadedHandler) {
        downloadedHandler({}, "Release notes", "v3.0.0");
      }

      // Should notify since different version
      expect(readyHandler).toHaveBeenCalledWith({ version: "v3.0.0" });
    });
  });

  describe("error handling", () => {
    it("catches errors during checkForUpdates", async () => {
      await initializeService(service);

      mockAutoUpdater.checkForUpdates.mockImplementation(() => {
        throw new Error("Network error");
      });

      // Should not throw
      expect(() => service.checkForUpdates()).not.toThrow();
    });

    it("handles setFeedURL failure gracefully", async () => {
      mockAutoUpdater.setFeedURL.mockImplementation(() => {
        throw new Error("Invalid URL");
      });

      // Should not throw
      expect(() => {
        const newService = new UpdatesService();
        newService.init();
      }).not.toThrow();
    });
  });
});
