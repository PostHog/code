import type { IBundledResources } from "@posthog/platform/bundled-resources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFile = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn(() => true));

vi.mock(import("node:child_process"), async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = {
    ...actual,
    execFile: mockExecFile as unknown as typeof actual.execFile,
    exec: mockExec as unknown as typeof actual.exec,
  };
  return { ...mocked, default: mocked };
});
vi.mock(import("node:fs"), async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = { ...actual, existsSync: mockExistsSync };
  return { ...mocked, default: mocked };
});
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

import { CliInstallService } from "./service";

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

function makeBundledResources(source: string): IBundledResources & {
  resolveExtraResource: ReturnType<typeof vi.fn>;
  resolve: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn((rel: string) => `/dev/app/${rel}`),
    resolveExtraResource: vi.fn(() => source),
  };
}

describe("CliInstallService", () => {
  let service: CliInstallService;
  let bundledResources: ReturnType<typeof makeBundledResources>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    setPlatform("darwin");
    bundledResources = makeBundledResources(
      "/Applications/PostHog Code.app/Contents/Resources/bin/posthog-code",
    );
    service = new CliInstallService(bundledResources);
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  describe("getBundledCliPath", () => {
    it("delegates to IBundledResources.resolveExtraResource", () => {
      bundledResources.resolveExtraResource.mockReturnValue(
        "/x/bin/posthog-code",
      );

      expect(service.getBundledCliPath()).toBe("/x/bin/posthog-code");
      expect(bundledResources.resolveExtraResource).toHaveBeenCalledWith(
        "bin/posthog-code",
      );
    });
  });

  describe("install", () => {
    it("returns an error on non-darwin platforms", async () => {
      setPlatform("linux");

      const result = await service.install();

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("only supported on macOS"),
      });
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("returns an error when the bundled CLI is missing", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.install();

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("CLI script not found"),
      });
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("returns success when the direct symlink succeeds", async () => {
      mockExecFile.mockImplementation((_cmd, _args, cb) => cb(null, "", ""));

      const result = await service.install();

      expect(result).toEqual({
        success: true,
        target: "/usr/local/bin/posthog-code",
      });
      expect(mockExecFile).toHaveBeenCalledWith(
        "ln",
        [
          "-sfn",
          expect.stringContaining("/bin/posthog-code"),
          "/usr/local/bin/posthog-code",
        ],
        expect.any(Function),
      );
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("falls back to osascript on permission errors", async () => {
      mockExecFile.mockImplementation((_cmd, _args, cb) =>
        cb(new Error("EACCES: permission denied"), "", ""),
      );
      mockExec.mockImplementation((_cmd, cb) => cb(null, "", ""));

      const result = await service.install();

      expect(result).toEqual({
        success: true,
        target: "/usr/local/bin/posthog-code",
      });
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining("osascript"),
        expect.any(Function),
      );
      const osascriptCall = mockExec.mock.calls[0][0] as string;
      expect(osascriptCall).toContain("administrator privileges");
      expect(osascriptCall).toContain("ln -sfn");
    });

    it("does not fall back to osascript on non-permission errors", async () => {
      mockExecFile.mockImplementation((_cmd, _args, cb) =>
        cb(new Error("disk full"), "", ""),
      );

      const result = await service.install();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("disk full");
      }
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("returns canceled=true when the user cancels the admin prompt", async () => {
      mockExecFile.mockImplementation((_cmd, _args, cb) =>
        cb(new Error("EACCES: permission denied"), "", ""),
      );
      mockExec.mockImplementation((_cmd, cb) =>
        cb(new Error("User canceled."), "", ""),
      );

      const result = await service.install();

      expect(result).toMatchObject({
        success: false,
        canceled: true,
      });
    });

    it("refuses to install when the source path contains shell-unsafe characters", async () => {
      bundledResources.resolveExtraResource.mockReturnValue("/some/'evil/path");
      mockExecFile.mockImplementation((_cmd, _args, cb) =>
        cb(new Error("permission denied"), "", ""),
      );

      const result = await service.install();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("unsafe characters");
      }
    });
  });
});
