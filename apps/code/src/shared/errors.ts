const AUTH_ERROR_PATTERNS = [
  "authentication required",
  "failed to authenticate",
  "authentication_error",
  "authentication_failed",
  "access token has expired",
] as const;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) return false;
  return AUTH_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

const FATAL_SESSION_ERROR_PATTERNS = [
  "internal error",
  "process exited",
  "session did not end",
  "not ready for writing",
  "session not found",
] as const;

function includesAny(
  value: string | undefined,
  patterns: readonly string[],
): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function isFatalSessionError(
  errorMessage: string,
  errorDetails?: string,
): boolean {
  return (
    includesAny(errorMessage, FATAL_SESSION_ERROR_PATTERNS) ||
    includesAny(errorDetails, FATAL_SESSION_ERROR_PATTERNS)
  );
}
