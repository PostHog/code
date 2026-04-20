import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectivityEvent } from "./schemas";

const mockFetch = vi.hoisted(() => vi.fn());

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

import { ConnectivityService } from "./service";

const ok = (status = 200) => ({ ok: true, status });
const notOk = (status = 500) => ({ ok: false, status });
const offline = () => {
  throw new Error("offline");
};

describe("ConnectivityService", () => {
  let service: ConnectivityService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(ok());
    vi.stubGlobal("fetch", mockFetch);

    service = new ConnectivityService();
  });

  afterEach(() => {
    service.stopPolling();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("init", () => {
    it("goes online after a successful HEAD check", async () => {
      mockFetch.mockResolvedValue(ok(204));

      service.init();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getStatus()).toEqual({ isOnline: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.google.com/generate_204",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("goes offline when the HEAD check throws", async () => {
      mockFetch.mockImplementation(offline);

      service.init();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getStatus()).toEqual({ isOnline: false });
    });
  });

  describe("checkNow", () => {
    it("returns online when HEAD succeeds", async () => {
      mockFetch.mockResolvedValue(ok(204));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const result = await service.checkNow();
      expect(result).toEqual({ isOnline: true });
    });

    it("returns offline when HEAD rejects", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const result = await service.checkNow();
      expect(result).toEqual({ isOnline: false });
    });

    it("returns offline when HEAD returns a non-ok non-204 response", async () => {
      mockFetch.mockResolvedValue(notOk(500));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const result = await service.checkNow();
      expect(result).toEqual({ isOnline: false });
    });
  });

  describe("status change events", () => {
    it("emits when going offline", async () => {
      mockFetch.mockResolvedValue(ok(204));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const handler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, handler);

      mockFetch.mockRejectedValue(new Error("offline"));
      await vi.advanceTimersByTimeAsync(3000);

      expect(handler).toHaveBeenCalledWith({ isOnline: false });
    });

    it("emits when coming back online", async () => {
      mockFetch.mockRejectedValue(new Error("offline"));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const handler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, handler);

      mockFetch.mockResolvedValue(ok(204));
      await vi.advanceTimersByTimeAsync(3000);

      expect(handler).toHaveBeenCalledWith({ isOnline: true });
    });

    it("does not emit when status is unchanged", async () => {
      mockFetch.mockResolvedValue(ok(204));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const handler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, handler);

      await vi.advanceTimersByTimeAsync(3000);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("HTTP verification", () => {
    it("accepts 204 status as success", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 204 });
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const result = await service.checkNow();
      expect(result).toEqual({ isOnline: true });
    });

    it("accepts 200 status as success", async () => {
      mockFetch.mockResolvedValue(ok(200));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const result = await service.checkNow();
      expect(result).toEqual({ isOnline: true });
    });
  });

  describe("polling", () => {
    it("polls periodically after init", async () => {
      mockFetch.mockResolvedValue(ok(204));
      service.init();
      await vi.advanceTimersByTimeAsync(0);

      const callsAfterInit = mockFetch.mock.calls.length;

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterInit);
    });
  });
});
