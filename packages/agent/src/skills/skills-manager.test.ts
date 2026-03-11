import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSagaRun = vi.hoisted(() => vi.fn());
const mockOverlayDownloadedSkills = vi.hoisted(() => vi.fn(async () => {}));
const mockSyncCodexSkills = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./update-skills-saga.js", () => ({
  UpdateSkillsSaga: vi.fn(() => ({ run: mockSagaRun })),
  overlayDownloadedSkills: mockOverlayDownloadedSkills,
  syncCodexSkills: mockSyncCodexSkills,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
}));

vi.mock("node:os", () => ({
  tmpdir: () => "/mock/tmp",
  default: { tmpdir: () => "/mock/tmp" },
}));

import { SkillsManager } from "./skills-manager.js";

const baseConfig = {
  runtimeSkillsDir: "/skills",
  runtimePluginDir: "/plugin",
  pluginPath: "/plugin",
  codexSkillsDir: "/codex",
  skillsZipUrl: "https://example.com/skills.zip",
  contextMillZipUrl: "https://example.com/context-mill.zip",
  updateIntervalMs: 30 * 60 * 1000,
  downloadFile: vi.fn(async () => {}),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
};

describe("SkillsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSagaRun.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("updateSkills", () => {
    it("runs the saga and returns true on success", async () => {
      const manager = new SkillsManager(baseConfig);
      const result = await manager.updateSkills();

      expect(mockSagaRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeSkillsDir: "/skills",
          runtimePluginDir: "/plugin",
          skillsZipUrl: "https://example.com/skills.zip",
          contextMillZipUrl: "https://example.com/context-mill.zip",
        }),
      );
      expect(result).toBe(true);
    });

    it("calls onUpdated callback on success", async () => {
      const onUpdated = vi.fn();
      const manager = new SkillsManager({ ...baseConfig, onUpdated });

      await manager.updateSkills();

      expect(onUpdated).toHaveBeenCalled();
    });

    it("returns false and calls onError when saga reports failure", async () => {
      mockSagaRun.mockResolvedValue({
        success: false,
        error: "download failed",
        failedStep: "download-skills",
      });
      const onError = vi.fn();
      const manager = new SkillsManager({ ...baseConfig, onError });

      const result = await manager.updateSkills();

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("returns false and calls onError when saga throws", async () => {
      mockSagaRun.mockRejectedValue(new Error("unexpected error"));
      const onError = vi.fn();
      const manager = new SkillsManager({ ...baseConfig, onError });

      const result = await manager.updateSkills();

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it("throttles: skips second call within interval", async () => {
      const manager = new SkillsManager(baseConfig);
      await manager.updateSkills();
      mockSagaRun.mockClear();

      const result = await manager.updateSkills();

      expect(result).toBe(false);
      expect(mockSagaRun).not.toHaveBeenCalled();
    });

    it("allows update after interval expires", async () => {
      const manager = new SkillsManager(baseConfig);
      await manager.updateSkills();
      mockSagaRun.mockClear();

      vi.advanceTimersByTime(31 * 60 * 1000);
      await manager.updateSkills();

      expect(mockSagaRun).toHaveBeenCalled();
    });

    it("reentrance guard: skips concurrent call", async () => {
      let resolveRun!: () => void;
      mockSagaRun.mockReturnValue(
        new Promise((resolve) => {
          resolveRun = () => resolve({ success: true });
        }),
      );

      const manager = new SkillsManager(baseConfig);
      const first = manager.updateSkills();

      vi.advanceTimersByTime(31 * 60 * 1000);
      const second = await manager.updateSkills();

      expect(second).toBe(false);

      resolveRun();
      await first;
      expect(mockSagaRun).toHaveBeenCalledTimes(1);
    });
  });

  describe("startPeriodicUpdates / stopPeriodicUpdates", () => {
    it("calls updateSkills on each interval tick", async () => {
      mockSagaRun.mockResolvedValue({ success: true });
      const manager = new SkillsManager(baseConfig);
      manager.startPeriodicUpdates();

      vi.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();

      expect(mockSagaRun).toHaveBeenCalled();
      manager.stopPeriodicUpdates();
    });

    it("stops calling after stopPeriodicUpdates", async () => {
      const manager = new SkillsManager(baseConfig);
      manager.startPeriodicUpdates();
      manager.stopPeriodicUpdates();
      mockSagaRun.mockClear();

      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();

      expect(mockSagaRun).not.toHaveBeenCalled();
    });

    it("stopPeriodicUpdates is safe to call before start", () => {
      const manager = new SkillsManager(baseConfig);
      expect(() => manager.stopPeriodicUpdates()).not.toThrow();
    });
  });

  describe("overlaySkills", () => {
    it("delegates to overlayDownloadedSkills with correct paths", async () => {
      const manager = new SkillsManager(baseConfig);
      await manager.overlaySkills();

      expect(mockOverlayDownloadedSkills).toHaveBeenCalledWith(
        "/skills",
        "/plugin",
      );
    });
  });

  describe("syncCodex", () => {
    it("delegates to syncCodexSkills with plugin path and codex dir", async () => {
      const manager = new SkillsManager(baseConfig);
      await manager.syncCodex();

      expect(mockSyncCodexSkills).toHaveBeenCalledWith("/plugin", "/codex");
    });
  });
});
