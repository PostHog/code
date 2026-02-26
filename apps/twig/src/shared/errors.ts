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

export function isAuthErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}
