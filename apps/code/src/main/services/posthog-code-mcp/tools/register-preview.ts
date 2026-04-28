import path from "node:path";

/** Ports we never let the agent target. Best-effort UX guard, not a security boundary. */
export const DENIED_PORTS = new Set<number>([
  22, // SSH
  25, // SMTP
  80, // HTTP
  443, // HTTPS
  5432, // Postgres
  6379, // Redis
  8123, // ClickHouse
  9000, // PostHog dev
]);

export interface PreviewInputCandidate {
  name: string;
  command: string;
  port: number;
  cwd?: string;
  healthPath?: string;
}

export interface ValidatedPreviewInput {
  /** Resolved absolute cwd, guaranteed inside `scratchpadRoot`. */
  cwd: string;
  port: number;
}

/**
 * Validate the agent-supplied preview registration input. Rejects:
 *  - non-1..65535 ports
 *  - ports on the denylist
 *  - cwd paths that escape the scratchpad root
 *
 * Throws `Error` with a descriptive message on failure. Pure — no side effects,
 * no I/O, no socket probing.
 */
export function validatePreviewInput(
  input: PreviewInputCandidate,
  scratchpadRoot: string,
): ValidatedPreviewInput {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error(
      `port must be an integer between 1 and 65535 (got ${input.port})`,
    );
  }

  if (DENIED_PORTS.has(input.port)) {
    throw new Error(
      `port ${input.port} is on the denylist (system or PostHog-reserved port)`,
    );
  }

  const requestedCwd = input.cwd ?? ".";
  const resolved = path.resolve(scratchpadRoot, requestedCwd);
  const relative = path.relative(scratchpadRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("cwd resolves outside scratchpad root");
  }

  return { cwd: resolved, port: input.port };
}
