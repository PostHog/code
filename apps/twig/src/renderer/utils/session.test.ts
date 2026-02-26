import { describe, expect, it } from "vitest";

import { isFatalSessionError } from "./session";

describe("isFatalSessionError", () => {
  it("detects fatal 'Internal error' pattern", () => {
    expect(isFatalSessionError("Internal error: process crashed")).toBe(true);
  });

  it("detects fatal 'process exited' pattern", () => {
    expect(isFatalSessionError("process exited with code 1")).toBe(true);
  });

  it("detects fatal 'Session not found' pattern", () => {
    expect(isFatalSessionError("Session not found")).toBe(true);
  });

  it("detects fatal 'Session did not end' pattern", () => {
    expect(isFatalSessionError("Session did not end cleanly")).toBe(true);
  });

  it("detects fatal 'not ready for writing' pattern", () => {
    expect(isFatalSessionError("not ready for writing")).toBe(true);
  });

  it("detects fatal pattern in errorDetails", () => {
    expect(isFatalSessionError("Unknown error", "Internal error: boom")).toBe(
      true,
    );
  });

  it("returns false for auth error wrapped in Internal error", () => {
    expect(
      isFatalSessionError(
        'Internal error: Failed to authenticate. API Error: 401 {"detail":"Authentication required"}',
      ),
    ).toBe(false);
  });

  it("returns false for plain Authentication required", () => {
    expect(isFatalSessionError("Authentication required")).toBe(false);
  });

  it("returns false for expired token error", () => {
    expect(isFatalSessionError("Access token has expired")).toBe(false);
  });

  it("returns false for authentication_error", () => {
    expect(isFatalSessionError("authentication_error")).toBe(false);
  });

  it("returns false for authentication_failed", () => {
    expect(isFatalSessionError("authentication_failed")).toBe(false);
  });

  it("returns false when auth pattern is in errorDetails", () => {
    expect(
      isFatalSessionError("Internal error", "Failed to authenticate"),
    ).toBe(false);
  });

  it("returns false for non-fatal errors", () => {
    expect(isFatalSessionError("Network timeout")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFatalSessionError("")).toBe(false);
  });
});
