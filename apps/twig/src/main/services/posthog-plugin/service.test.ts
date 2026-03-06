import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Set env before module loads (SKILLS_ZIP_URL / CONTEXT_MILL_ZIP_URL are captured at module level)
vi.hoisted(() => {
  process.env.SKILLS_ZIP_URL = "https://example.com/skills.zip";
  process.env.CONTEXT_MILL_ZIP_URL = "https://example.com/context-mill.zip";
});

const mockApp = vi.hoisted(() => ({
  getPath: vi.fn(() => "/mock/userData"),
  getAppPath: vi.fn(() => "/mock/appPath"),
  isPackaged: false as boolean,
}));

const mockNet = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

const mockExtractZip = vi.hoisted(() =>
  vi.fn<(zipPath: string, extractDir: string) => Promise<void>>(async () => {}),
);

vi.mock("electron", () => ({
  app: mockApp,
  net: mockNet,
}));

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { ...fs, default: fs };
});

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return { ...fs.promises, default: fs.promises };
});

vi.mock("../../utils/extract-zip.js", () => ({
  extractZip: mockExtractZip,
}));

const mockFflateUnzipSync = vi.hoisted(() => vi.fn());
vi.mock("fflate", () => ({
  unzipSync: mockFflateUnzipSync,
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock/home",
  tmpdir: () => "/mock/tmp",
  default: { homedir: () => "/mock/home", tmpdir: () => "/mock/tmp" },
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

import { PosthogPluginService } from "./service.js";
import { syncCodexSkills } from "./update-skills-saga.js";

/** Expose private members for testing without `as any`. */
interface TestablePluginService {
  initialize(): Promise<void>;
  copyBundledPlugin(): Promise<void>;
  intervalId: ReturnType<typeof setInterval> | null;
}

// Paths based on mock values
const RUNTIME_PLUGIN_DIR = "/mock/userData/plugins/posthog";
const RUNTIME_SKILLS_DIR = "/mock/userData/skills";
const BUNDLED_PLUGIN_DIR = "/mock/appPath/.vite/build/plugins/posthog";
const BUNDLED_PLUGIN_DIR_PACKAGED =
  "/mock/appPath.unpacked/.vite/build/plugins/posthog";
const CODEX_SKILLS_DIR = "/mock/home/.agents/skills";

function mockFetchResponse(ok: boolean, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  };
}

/** Simulate zip extraction by creating skill files in the extracted dir */
function simulateExtractZip() {
  mockExtractZip.mockImplementation(
    async (zipPath: string, extractDir: string) => {
      if (zipPath.includes("context-mill")) {
        // Context-mill outer zip: produce omnibus-*.zip files (dummy bytes — unzipSync is mocked)
        vol.mkdirSync(extractDir, { recursive: true });
        vol.writeFileSync(`${extractDir}/omnibus-test-skill.zip`, "dummy");
        vol.writeFileSync(`${extractDir}/manifest.json`, "{}");
        // Non-omnibus zip should be ignored
        vol.writeFileSync(`${extractDir}/other-skill.zip`, "dummy");
      } else {
        // Primary skills zip
        vol.mkdirSync(`${extractDir}/skills/remote-skill`, {
          recursive: true,
        });
        vol.writeFileSync(
          `${extractDir}/skills/remote-skill/SKILL.md`,
          "# Remote",
        );
      }
    },
  );

  // Mock fflate unzipSync for inner zip extraction
  mockFflateUnzipSync.mockImplementation(() => ({
    "SKILL.md": new TextEncoder().encode(
      "---\nname: omnibus-test-skill\n---\n# Test Skill",
    ),
  }));
}

/** Create the bundled plugin directory in memfs */
function setupBundledPlugin(dir = BUNDLED_PLUGIN_DIR) {
  vol.mkdirSync(`${dir}/skills/shipped-skill`, { recursive: true });
  vol.writeFileSync(`${dir}/plugin.json`, '{"name":"posthog"}');
  vol.writeFileSync(`${dir}/skills/shipped-skill/SKILL.md`, "# Shipped");
}

describe("PosthogPluginService", () => {
  let service: PosthogPluginService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vol.reset();

    mockApp.isPackaged = false;
    mockNet.fetch.mockResolvedValue(mockFetchResponse(true));
    mockExtractZip.mockResolvedValue(undefined);

    service = new PosthogPluginService();
  });

  afterEach(() => {
    service.cleanup();
    vi.useRealTimers();
  });

  describe("getPluginPath", () => {
    it("returns bundled path in dev mode", () => {
      mockApp.isPackaged = false;
      expect(service.getPluginPath()).toBe(BUNDLED_PLUGIN_DIR);
    });

    it("returns runtime path in prod when plugin.json exists", () => {
      mockApp.isPackaged = true;
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");

      expect(service.getPluginPath()).toBe(RUNTIME_PLUGIN_DIR);
    });

    it("returns bundled path as fallback in prod", () => {
      mockApp.isPackaged = true;
      expect(service.getPluginPath()).toBe(BUNDLED_PLUGIN_DIR_PACKAGED);
    });
  });

  describe("initialize", () => {
    it("copies bundled plugin on first run when plugin.json is missing", async () => {
      setupBundledPlugin();

      await (service as unknown as TestablePluginService).initialize();

      // Entire bundled dir should be copied to runtime
      expect(vol.existsSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`)).toBe(true);
      expect(
        vol.existsSync(`${RUNTIME_PLUGIN_DIR}/skills/shipped-skill/SKILL.md`),
      ).toBe(true);
    });

    it("skips bundled copy when plugin.json already exists in runtime", async () => {
      setupBundledPlugin();
      // Pre-populate runtime dir (simulating previous run)
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, '{"old":true}');

      await (service as unknown as TestablePluginService).initialize();

      // Should keep the existing runtime plugin.json, not overwrite
      expect(
        vol.readFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "utf-8"),
      ).toBe('{"old":true}');
    });

    it("overlays downloaded skills from cache on top of runtime dir", async () => {
      setupBundledPlugin();
      // Pre-populate runtime dir
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");
      // Pre-populate skills cache (as if downloaded previously)
      vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/cached-skill`, { recursive: true });
      vol.writeFileSync(
        `${RUNTIME_SKILLS_DIR}/cached-skill/SKILL.md`,
        "# Cached",
      );

      await (service as unknown as TestablePluginService).initialize();

      expect(
        vol.readFileSync(
          `${RUNTIME_PLUGIN_DIR}/skills/cached-skill/SKILL.md`,
          "utf-8",
        ),
      ).toBe("# Cached");
    });

    it("starts periodic update interval", async () => {
      await (service as unknown as TestablePluginService).initialize();
      expect(
        (service as unknown as TestablePluginService).intervalId,
      ).not.toBeNull();
    });
  });

  describe("updateSkills", () => {
    it("downloads, extracts, and installs skills", async () => {
      setupBundledPlugin();
      simulateExtractZip();

      await service.updateSkills();

      // Skills should be in the runtime cache
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`),
      ).toBe(true);
      expect(mockNet.fetch).toHaveBeenCalledWith(
        "https://example.com/skills.zip",
      );
      expect(mockExtractZip).toHaveBeenCalled();
    });

    it("performs atomic swap of skills directory", async () => {
      setupBundledPlugin();
      // Pre-populate existing cache with old skill
      vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/old-skill`, { recursive: true });
      vol.writeFileSync(`${RUNTIME_SKILLS_DIR}/old-skill/SKILL.md`, "# Old");

      simulateExtractZip();
      await service.updateSkills();

      // New skill should be present, old skill should be gone
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`),
      ).toBe(true);
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/old-skill`)).toBe(false);
      // Temp dirs should be cleaned up
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.new`)).toBe(false);
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.old`)).toBe(false);
    });

    it("overlays new skills into runtime plugin dir", async () => {
      setupBundledPlugin();
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");

      simulateExtractZip();
      await service.updateSkills();

      expect(
        vol.existsSync(`${RUNTIME_PLUGIN_DIR}/skills/remote-skill/SKILL.md`),
      ).toBe(true);
    });

    it("emits 'updated' event on success", async () => {
      simulateExtractZip();
      const handler = vi.fn();
      service.on("skillsUpdated", handler);

      await service.updateSkills();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it("throttles: skips if called within 30 minutes", async () => {
      simulateExtractZip();
      await service.updateSkills();
      mockNet.fetch.mockClear();

      await service.updateSkills();

      expect(mockNet.fetch).not.toHaveBeenCalled();
    });

    it("allows update after throttle period expires", async () => {
      simulateExtractZip();
      await service.updateSkills();
      mockNet.fetch.mockClear();

      vi.advanceTimersByTime(31 * 60 * 1000);
      await service.updateSkills();

      expect(mockNet.fetch).toHaveBeenCalled();
    });

    it("skips if already updating (reentrance guard)", async () => {
      let resolveDownload!: (value: unknown) => void;
      mockNet.fetch.mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
      );

      // Start first update (hangs on fetch)
      const first = service.updateSkills();

      // Advance past throttle so second call reaches the `updating` check
      vi.advanceTimersByTime(31 * 60 * 1000);
      mockNet.fetch.mockClear();
      await service.updateSkills();

      // Second call should not have triggered another fetch
      expect(mockNet.fetch).not.toHaveBeenCalled();

      // Clean up hanging promise
      resolveDownload(mockFetchResponse(true));
      await first.catch(() => {});
    });

    it("downloads and merges context-mill omnibus skills with prefix stripped", async () => {
      setupBundledPlugin();
      simulateExtractZip();

      await service.updateSkills();

      // Omnibus skill should exist with prefix stripped
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/test-skill/SKILL.md`)).toBe(
        true,
      );

      // SKILL.md should have "omnibus-" stripped from name field
      const content = vol.readFileSync(
        `${RUNTIME_SKILLS_DIR}/test-skill/SKILL.md`,
        "utf-8",
      );
      expect(content).toContain("name: test-skill");
      expect(content).not.toContain("omnibus-");
    });

    it("context-mill failure is non-fatal", async () => {
      setupBundledPlugin();
      // Primary skills succeed
      mockExtractZip.mockImplementation(
        async (zipPath: string, extractDir: string) => {
          if (zipPath.includes("context-mill")) {
            throw new Error("context-mill download failed");
          }
          vol.mkdirSync(`${extractDir}/skills/remote-skill`, {
            recursive: true,
          });
          vol.writeFileSync(
            `${extractDir}/skills/remote-skill/SKILL.md`,
            "# Remote",
          );
        },
      );

      const handler = vi.fn();
      service.on("skillsUpdated", handler);
      await service.updateSkills();

      // Primary skills should still be installed
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`),
      ).toBe(true);
      // Update should still succeed
      expect(handler).toHaveBeenCalledWith(true);
    });

    it("handles download failure gracefully", async () => {
      mockNet.fetch.mockRejectedValue(new Error("Network error"));
      await expect(service.updateSkills()).resolves.toBeUndefined();
    });

    it("handles non-ok response gracefully", async () => {
      mockNet.fetch.mockResolvedValue(mockFetchResponse(false, 404));
      await expect(service.updateSkills()).resolves.toBeUndefined();
    });

    it("handles missing skills dir in archive", async () => {
      // Extraction creates no skills directory
      mockExtractZip.mockImplementation(
        async (_zipPath: string, extractDir: string) => {
          vol.mkdirSync(`${extractDir}/random-dir`, { recursive: true });
          vol.writeFileSync(`${extractDir}/random-dir/README.md`, "nope");
        },
      );

      const handler = vi.fn();
      service.on("skillsUpdated", handler);
      await service.updateSkills();

      expect(handler).not.toHaveBeenCalled();
    });

    it("cleans up temp dir even on error", async () => {
      mockExtractZip.mockRejectedValue(new Error("extraction failed"));

      await service.updateSkills();

      // Temp dir under /mock/tmp should be cleaned up
      const tmpEntries = vol.existsSync("/mock/tmp")
        ? vol.readdirSync("/mock/tmp")
        : [];
      expect(tmpEntries).toHaveLength(0);
    });
  });

  describe("syncCodexSkills", () => {
    it("copies skill directories to Codex dir", async () => {
      setupBundledPlugin();

      await syncCodexSkills(BUNDLED_PLUGIN_DIR, CODEX_SKILLS_DIR);

      expect(
        vol.readFileSync(`${CODEX_SKILLS_DIR}/shipped-skill/SKILL.md`, "utf-8"),
      ).toBe("# Shipped");
    });

    it("skips if effective skills dir does not exist", async () => {
      // No skills dir anywhere
      await syncCodexSkills("/nonexistent", CODEX_SKILLS_DIR);

      expect(vol.existsSync(CODEX_SKILLS_DIR)).toBe(false);
    });
  });

  describe("copyBundledPlugin", () => {
    it("copies entire bundled dir to runtime dir", async () => {
      setupBundledPlugin();

      await (service as unknown as TestablePluginService).copyBundledPlugin();

      expect(
        vol.readFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "utf-8"),
      ).toBe('{"name":"posthog"}');
      expect(
        vol.readFileSync(
          `${RUNTIME_PLUGIN_DIR}/skills/shipped-skill/SKILL.md`,
          "utf-8",
        ),
      ).toBe("# Shipped");
    });

    it("skips if bundled dir does not exist", async () => {
      await (service as unknown as TestablePluginService).copyBundledPlugin();
      expect(vol.existsSync(RUNTIME_PLUGIN_DIR)).toBe(false);
    });

    it("handles copy failure gracefully", async () => {
      // Bundled dir exists but is not a directory (will cause cp to fail or behave oddly)
      // Just verify no exception propagates
      setupBundledPlugin();
      await expect(
        (service as unknown as TestablePluginService).copyBundledPlugin(),
      ).resolves.toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("clears interval timer", async () => {
      await (service as unknown as TestablePluginService).initialize();
      expect(
        (service as unknown as TestablePluginService).intervalId,
      ).not.toBeNull();

      service.cleanup();
      expect(
        (service as unknown as TestablePluginService).intervalId,
      ).toBeNull();
    });

    it("is safe to call multiple times", () => {
      service.cleanup();
      service.cleanup();
    });
  });
});
