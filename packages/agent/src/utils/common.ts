import type { Logger } from "./logger";

/**
 * Races an operation against a timeout.
 * Returns success with the value if the operation completes in time,
 * or timeout if the operation takes longer than the specified duration.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<{ result: "success"; value: T } | { result: "timeout" }> {
  const timeoutPromise = new Promise<{ result: "timeout" }>((resolve) =>
    setTimeout(() => resolve({ result: "timeout" }), timeoutMs),
  );
  const operationPromise = operation.then((value) => ({
    result: "success" as const,
    value,
  }));
  return Promise.race([operationPromise, timeoutPromise]);
}

export const IS_ROOT =
  typeof process !== "undefined" &&
  (process.geteuid?.() ?? process.getuid?.()) === 0;

export const ALLOW_BYPASS = !IS_ROOT || !!process.env.IS_SANDBOX;

export function unreachable(value: never, logger: Logger): void {
  let valueAsString: string;
  try {
    valueAsString = JSON.stringify(value);
  } catch {
    valueAsString = String(value);
  }
  logger.error(`Unexpected case: ${valueAsString}`);
}

const DEFAULT_TRUNCATE_LIMIT = 200;

export function truncateForLog(
  value: unknown,
  limit: number = DEFAULT_TRUNCATE_LIMIT,
): string {
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }
  if (str.length <= limit) return str;
  return `${str.slice(0, limit)}…(+${str.length - limit} chars)`;
}
