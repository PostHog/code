import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { isLoopbackAddress, runGh } from "./gh-exec";

describe("isLoopbackAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.0.0.2", true],
    ["127.1.2.3", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:127.1.2.3", true],
    ["localhost", true],
    ["10.0.0.1", false],
    ["192.168.1.1", false],
    ["::ffff:10.0.0.1", false],
    ["8.8.8.8", false],
    ["128.0.0.1", false],
    ["", false],
    [undefined, false],
  ])("address %s -> %s", (input, expected) => {
    expect(isLoopbackAddress(input)).toBe(expected);
  });
});

describe("runGh", () => {
  it("captures stdout, stderr, and a zero exit code", async () => {
    const result = await runGh(
      ["-e", "process.stdout.write('hi'); process.stderr.write('err');"],
      {
        cwd: tmpdir(),
        timeoutMs: 5_000,
        binary: process.execPath,
      },
    );

    expect(result.stdout).toBe("hi");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("surfaces non-zero exit codes without throwing", async () => {
    const result = await runGh(["-e", "process.exit(2)"], {
      cwd: tmpdir(),
      timeoutMs: 5_000,
      binary: process.execPath,
    });

    expect(result.exitCode).toBe(2);
    expect(result.timedOut).toBe(false);
  });

  it("rejects when the binary is missing", async () => {
    await expect(
      runGh(["--version"], {
        cwd: tmpdir(),
        timeoutMs: 5_000,
        binary: "/nonexistent/binary/that/cannot/possibly/exist",
      }),
    ).rejects.toThrow();
  });

  it("kills the process on timeout and reports timedOut: true", async () => {
    const start = Date.now();
    const result = await runGh(
      ["-e", "setTimeout(() => process.exit(0), 60_000);"],
      {
        cwd: tmpdir(),
        timeoutMs: 200,
        binary: process.execPath,
      },
    );

    expect(result.timedOut).toBe(true);
    // Should be killed well before the 60s sleep would have completed.
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it("respects the cwd option", async () => {
    const expected = tmpdir();
    const result = await runGh(["-e", "process.stdout.write(process.cwd());"], {
      cwd: expected,
      timeoutMs: 5_000,
      binary: process.execPath,
    });

    // Resolve through realpath-style equivalence: tmpdir on macOS may be a
    // symlink (e.g. /var/folders -> /private/var/folders).
    expect([expected, `/private${expected}`]).toContain(result.stdout);
    expect(result.exitCode).toBe(0);
  });
});
