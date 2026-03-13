import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApp = vi.hoisted(() => ({
  setAsDefaultProtocolClient: vi.fn(),
}));

vi.mock("electron", () => ({
  app: mockApp,
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

import { DeepLinkService } from "./service";

describe("DeepLinkService", () => {
  let service: DeepLinkService;
  let originalDefaultApp: boolean | undefined;

  const setDefaultApp = (value: boolean | undefined) => {
    Object.defineProperty(process, "defaultApp", {
      value,
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalDefaultApp = process.defaultApp;
    service = new DeepLinkService();
  });

  afterEach(() => {
    setDefaultApp(originalDefaultApp);
  });

  describe("registerProtocol", () => {
    it("registers posthog-code and legacy protocols in production", () => {
      setDefaultApp(false);

      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
        "posthog-code",
      );
      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith("twig");
      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith("array");
      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledTimes(3);
    });

    it("skips protocol registration in development mode", () => {
      setDefaultApp(true);

      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    });

    it("prevents multiple registrations", () => {
      setDefaultApp(false);

      service.registerProtocol();
      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledTimes(3);
    });
  });

  describe("registerHandler", () => {
    it("registers a handler for a key", () => {
      const handler = vi.fn(() => true);

      service.registerHandler("task", handler);

      const result = service.handleUrl("posthog-code://task/123");
      expect(handler).toHaveBeenCalledWith("123", expect.any(URLSearchParams));
      expect(result).toBe(true);
    });

    it("overwrites existing handler for same key", () => {
      const handler1 = vi.fn(() => true);
      const handler2 = vi.fn(() => false);

      service.registerHandler("task", handler1);
      service.registerHandler("task", handler2);

      service.handleUrl("posthog-code://task/123");
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe("unregisterHandler", () => {
    it("removes a registered handler", () => {
      const handler = vi.fn(() => true);
      service.registerHandler("task", handler);

      service.unregisterHandler("task");

      const result = service.handleUrl("posthog-code://task/123");
      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("does not throw when unregistering non-existent handler", () => {
      expect(() => service.unregisterHandler("nonexistent")).not.toThrow();
    });
  });

  describe("handleUrl", () => {
    beforeEach(() => {
      service.registerHandler("task", (path, _params) => {
        return path.length > 0;
      });
      service.registerHandler("oauth", () => true);
    });

    describe("posthog-code:// protocol", () => {
      it("handles posthog-code:// URLs", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("test", handler);

        const result = service.handleUrl("posthog-code://test/foo");
        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith(
          "foo",
          expect.any(URLSearchParams),
        );
      });

      it("passes path segments to handler", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("task", handler);

        service.handleUrl("posthog-code://task/abc123/details");
        expect(handler).toHaveBeenCalledWith(
          "abc123/details",
          expect.any(URLSearchParams),
        );
      });

      it("passes query parameters to handler", () => {
        const handler = vi.fn((_path, params) => {
          expect(params.get("token")).toBe("secret");
          expect(params.get("redirect")).toBe("home");
          return true;
        });
        service.registerHandler("auth", handler);

        service.handleUrl(
          "posthog-code://auth/callback?token=secret&redirect=home",
        );
        expect(handler).toHaveBeenCalled();
      });

      it("handles empty path", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("ping", handler);

        service.handleUrl("posthog-code://ping");
        expect(handler).toHaveBeenCalledWith("", expect.any(URLSearchParams));
      });
    });

    describe("twig:// protocol (legacy)", () => {
      it("handles twig:// URLs for backwards compatibility", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("task", handler);

        const result = service.handleUrl("twig://task/123");
        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith(
          "123",
          expect.any(URLSearchParams),
        );
      });

      it("works identically to posthog-code:// protocol", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("oauth", handler);

        service.handleUrl("twig://oauth/callback?code=abc");
        expect(handler).toHaveBeenCalledWith(
          "callback",
          expect.any(URLSearchParams),
        );
      });
    });

    describe("array:// protocol (legacy)", () => {
      it("handles array:// URLs for backwards compatibility", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("callback", handler);

        const result = service.handleUrl("array://callback?code=abc");
        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith("", expect.any(URLSearchParams));
      });
    });

    describe("error handling", () => {
      it("returns false for non-matching protocols", () => {
        expect(service.handleUrl("https://example.com")).toBe(false);
        expect(service.handleUrl("myapp://task/123")).toBe(false);
        expect(service.handleUrl("file:///path/to/file")).toBe(false);
      });

      it("returns false for URLs without main key", () => {
        expect(service.handleUrl("posthog-code://")).toBe(false);
      });

      it("returns false for unregistered handlers", () => {
        const result = service.handleUrl("posthog-code://unknown/path");
        expect(result).toBe(false);
      });

      it("returns false for malformed URLs", () => {
        expect(service.handleUrl("posthog-code://[invalid")).toBe(false);
      });

      it("returns handler result when handler returns false", () => {
        service.registerHandler("failing", () => false);
        const result = service.handleUrl("posthog-code://failing/test");
        expect(result).toBe(false);
      });
    });
  });

  describe("getProtocol", () => {
    it("returns the posthog-code protocol", () => {
      expect(service.getProtocol()).toBe("posthog-code");
    });
  });
});
