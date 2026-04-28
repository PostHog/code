import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPty = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node-pty", () => mockPty);

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
    ScratchpadService: Symbol.for("Main.ScratchpadService"),
  },
}));

import type { Manifest } from "../scratchpad/schemas";
import type { ScratchpadService } from "../scratchpad/service";
import type { PreviewExitedPayload, PreviewReadyPayload } from "./schemas";
import { PreviewService, PreviewServiceEvent } from "./service";

interface FakePty {
  pid: number;
  onExit: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  /** Trigger the registered exit listener. */
  triggerExit: (info: { exitCode: number; signal?: number }) => void;
}

function createFakePty(pid = 4321): FakePty {
  let listener: ((info: { exitCode: number; signal?: number }) => void) | null =
    null;
  const onExit = vi.fn(
    (cb: (info: { exitCode: number; signal?: number }) => void) => {
      listener = cb;
      return { dispose: vi.fn() };
    },
  );
  return {
    pid,
    onExit,
    kill: vi.fn(),
    triggerExit: (info: { exitCode: number; signal?: number }) => {
      listener?.(info);
    },
  } as unknown as FakePty;
}

function createMockScratchpad(): {
  service: ScratchpadService;
  manifest: Manifest;
  writeManifest: ReturnType<typeof vi.fn>;
} {
  const manifest: Manifest = {
    projectId: 1,
    published: false,
  };
  const writeManifest = vi.fn(
    async (_taskId: string, patch: Partial<Manifest>) => {
      Object.assign(manifest, patch);
      return manifest;
    },
  );
  const service = {
    readManifest: vi.fn(async () => manifest),
    writeManifest,
  } as unknown as ScratchpadService;
  return { service, manifest, writeManifest };
}

const SCRATCHPAD_ROOT = "/tmp/scratchpads/task-1/myapp";

describe("PreviewService", () => {
  let service: PreviewService;
  let scratchpad: ReturnType<typeof createMockScratchpad>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    scratchpad = createMockScratchpad();
    service = new PreviewService(scratchpad.service);

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await service.shutdown();
    vi.unstubAllGlobals();
  });

  /** Drive the health-poll loop forward by one tick (interval+microtasks). */
  async function tickPoll(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    // Allow any pending fetch promise to resolve, then advance the next interval.
    await vi.advanceTimersByTimeAsync(1000);
  }

  it("happy path: spawn, health-passes, manifest written, returns URL, emits PreviewReady", async () => {
    const fakePty = createFakePty();
    mockPty.spawn.mockReturnValue(fakePty);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const readyPayloads: PreviewReadyPayload[] = [];
    service.on(PreviewServiceEvent.PreviewReady, (p) => readyPayloads.push(p));

    const promise = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });

    // Let the loop run.
    await tickPoll();
    await tickPoll();

    const result = await promise;
    expect(result.url).toBe("http://127.0.0.1:5173");
    expect(mockPty.spawn).toHaveBeenCalledWith(
      "/bin/sh",
      ["-lc", "pnpm dev"],
      expect.objectContaining({ cwd: SCRATCHPAD_ROOT }),
    );
    expect(scratchpad.writeManifest).toHaveBeenCalledWith("task-1", {
      preview: [
        { name: "frontend", command: "pnpm dev", port: 5173, cwd: undefined },
      ],
    });
    expect(readyPayloads).toEqual([
      {
        taskId: "task-1",
        name: "frontend",
        url: "http://127.0.0.1:5173",
        port: 5173,
      },
    ]);
  });

  it("multi-preview: two concurrent registrations under different names both run", async () => {
    const ptyA = createFakePty(1001);
    const ptyB = createFakePty(1002);
    mockPty.spawn.mockReturnValueOnce(ptyA).mockReturnValueOnce(ptyB);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const promiseA = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });
    const promiseB = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "backend",
      command: "pnpm api",
      port: 4000,
    });

    await tickPoll();
    await tickPoll();

    const [a, b] = await Promise.all([promiseA, promiseB]);
    expect(a.url).toBe("http://127.0.0.1:5173");
    expect(b.url).toBe("http://127.0.0.1:4000");
    const list = await service.list("task-1");
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name).sort()).toEqual(["backend", "frontend"]);
  });

  it("re-register same (taskId, name) kills the prior process first", async () => {
    const ptyA = createFakePty(1001);
    const ptyB = createFakePty(1002);
    mockPty.spawn.mockReturnValueOnce(ptyA).mockReturnValueOnce(ptyB);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const promiseA = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });
    await tickPoll();
    await tickPoll();
    await promiseA;

    expect(ptyA.kill).not.toHaveBeenCalled();

    const promiseB = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });
    await tickPoll();
    await tickPoll();
    await promiseB;

    expect(ptyA.kill).toHaveBeenCalledTimes(1);
  });

  it("rejects denylisted ports (5432) before spawning", async () => {
    await expect(
      service.register({
        taskId: "task-1",
        scratchpadRoot: SCRATCHPAD_ROOT,
        name: "db",
        command: "echo",
        port: 5432,
      }),
    ).rejects.toThrow(/denylist/);
    expect(mockPty.spawn).not.toHaveBeenCalled();
  });

  it("rejects port already bound by another in-flight preview", async () => {
    const ptyA = createFakePty(1001);
    mockPty.spawn.mockReturnValueOnce(ptyA);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const promiseA = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });
    await tickPoll();
    await tickPoll();
    await promiseA;

    await expect(
      service.register({
        taskId: "task-2",
        scratchpadRoot: SCRATCHPAD_ROOT,
        name: "other",
        command: "pnpm dev",
        port: 5173,
      }),
    ).rejects.toThrow(/already in use/);
  });

  it("rejects cwd outside scratchpad root", async () => {
    await expect(
      service.register({
        taskId: "task-1",
        scratchpadRoot: SCRATCHPAD_ROOT,
        name: "frontend",
        command: "pnpm dev",
        port: 5173,
        cwd: "../../../../etc",
      }),
    ).rejects.toThrow(/outside scratchpad root/);
    expect(mockPty.spawn).not.toHaveBeenCalled();
  });

  it("emits PreviewExited with exit code when process crashes mid-run", async () => {
    const ptyA = createFakePty(1001);
    mockPty.spawn.mockReturnValue(ptyA);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const exited: PreviewExitedPayload[] = [];
    service.on(PreviewServiceEvent.PreviewExited, (p) => exited.push(p));

    const promise = service.register({
      taskId: "task-1",
      scratchpadRoot: SCRATCHPAD_ROOT,
      name: "frontend",
      command: "pnpm dev",
      port: 5173,
    });
    await tickPoll();
    await tickPoll();
    await promise;

    ptyA.triggerExit({ exitCode: 137, signal: 9 });

    expect(exited).toEqual([
      {
        taskId: "task-1",
        name: "frontend",
        exitCode: 137,
        signal: "9",
      },
    ]);
  });

  it("shutdown() kills all preview processes", async () => {
    const ptyA = createFakePty(1001);
    const ptyB = createFakePty(1002);
    mockPty.spawn.mockReturnValueOnce(ptyA).mockReturnValueOnce(ptyB);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    await Promise.all([
      (async () => {
        const p = service.register({
          taskId: "task-1",
          scratchpadRoot: SCRATCHPAD_ROOT,
          name: "frontend",
          command: "pnpm dev",
          port: 5173,
        });
        await tickPoll();
        await tickPoll();
        await p;
      })(),
      (async () => {
        const p = service.register({
          taskId: "task-1",
          scratchpadRoot: SCRATCHPAD_ROOT,
          name: "backend",
          command: "pnpm api",
          port: 4000,
        });
        await tickPoll();
        await tickPoll();
        await p;
      })(),
    ]);

    await service.shutdown();
    expect(ptyA.kill).toHaveBeenCalledTimes(1);
    expect(ptyB.kill).toHaveBeenCalledTimes(1);
    expect(await service.list("task-1")).toEqual([]);
  });

  it("resumeFromManifest spawns previews from manifest entries; per-preview failures are isolated", async () => {
    scratchpad.manifest.preview = [
      { name: "frontend", command: "pnpm dev", port: 5173 },
      { name: "broken", command: "pnpm bork", port: 5432 }, // denylisted, will fail
      { name: "backend", command: "pnpm api", port: 4000 },
    ];
    const ptyA = createFakePty(1001);
    const ptyC = createFakePty(1003);
    mockPty.spawn.mockReturnValueOnce(ptyA).mockReturnValueOnce(ptyC);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const exited: PreviewExitedPayload[] = [];
    service.on(PreviewServiceEvent.PreviewExited, (p) => exited.push(p));

    const promise = service.resumeFromManifest("task-1", SCRATCHPAD_ROOT);
    // Drive both health probes to completion.
    for (let i = 0; i < 6; i += 1) {
      await tickPoll();
    }
    await promise;

    // Two valid entries spawned, one denylisted entry surfaced via PreviewExited.
    expect(mockPty.spawn).toHaveBeenCalledTimes(2);
    const failed = exited.find((e) => e.signal === "RESUME_FAILED");
    expect(failed?.name).toBe("broken");
  });
});
