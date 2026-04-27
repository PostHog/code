import { describe, expect, it, vi } from "vitest";
import { resolveAgentshRuntimeInfo } from "./agentsh-runtime";

describe("agentsh runtime detection", () => {
  it("returns null when no agentsh session marker exists", async () => {
    const getVersion = vi.fn();
    const result = await resolveAgentshRuntimeInfo({
      readSessionId: async () => {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
      getVersion,
    });

    expect(result).toBeNull();
    expect(getVersion).not.toHaveBeenCalled();
  });

  it("returns the agentsh session id and version", async () => {
    const result = await resolveAgentshRuntimeInfo({
      readSessionId: async () => "session-123\n",
      getVersion: async () => ({
        stdout: "agentsh version 0.16.7\n",
        stderr: "",
      }),
    });

    expect(result).toEqual({
      sessionId: "session-123",
      version: "agentsh version 0.16.7",
    });
  });

  it("keeps the agentsh signal when version lookup fails", async () => {
    const result = await resolveAgentshRuntimeInfo({
      readSessionId: async () => "session-123\n",
      getVersion: async () => {
        throw new Error("agentsh not found");
      },
    });

    expect(result).toEqual({
      sessionId: "session-123",
      version: null,
      versionLookupError: "agentsh not found",
    });
  });
});
