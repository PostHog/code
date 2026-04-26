import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewService } from "../preview/service";
import type { ScratchpadService } from "../scratchpad/service";
import { PosthogCodeMcpService } from "./service";

describe("PosthogCodeMcpService", () => {
  let service: PosthogCodeMcpService;
  let previewRegister: ReturnType<typeof vi.fn>;
  let scratchpadGetPath: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previewRegister = vi.fn();
    scratchpadGetPath = vi.fn();
    const previewStub = {
      register: previewRegister,
      unregister: vi.fn(),
      list: vi.fn(),
    } as unknown as PreviewService;
    const scratchpadStub = {
      getScratchpadPath: scratchpadGetPath,
      readManifest: vi.fn(),
      writeManifest: vi.fn(),
    } as unknown as ScratchpadService;
    service = new PosthogCodeMcpService(previewStub, scratchpadStub);
  });

  afterEach(async () => {
    await service.stop();
    vi.restoreAllMocks();
  });

  it("returns the spawned preview URL when registerPreview succeeds", async () => {
    scratchpadGetPath.mockResolvedValueOnce("/userData/scratchpads/t/p");
    previewRegister.mockResolvedValueOnce({ url: "http://127.0.0.1:5173" });

    const result = await service.handleRegisterPreview({
      taskId: "t",
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ url: "http://127.0.0.1:5173" });
    expect(previewRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t",
        scratchpadRoot: "/userData/scratchpads/t/p",
        name: "frontend",
        port: 5173,
      }),
    );
  });

  it("returns a structured error when no scratchpad exists for the taskId", async () => {
    scratchpadGetPath.mockResolvedValueOnce(null);

    const result = await service.handleRegisterPreview({
      taskId: "missing",
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No scratchpad found/);
    expect(previewRegister).not.toHaveBeenCalled();
  });

  it("returns a structured error when register() throws (port denylist, cwd guard, etc.)", async () => {
    scratchpadGetPath.mockResolvedValueOnce("/userData/scratchpads/t/p");
    previewRegister.mockRejectedValueOnce(new Error("port 5432 is reserved"));

    const result = await service.handleRegisterPreview({
      taskId: "t",
      name: "db",
      command: "pg ctl",
      port: 5432,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("port 5432 is reserved");
  });
});
