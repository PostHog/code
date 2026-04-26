export function normalizeRepoKey(key: string): string {
  return key.trim().replace(/\.git$/, "");
}

/** Validates the GitHub repo name character set + length cap. */
export const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Sanitize a free-form name into something acceptable as a GitHub repo name.
 * Replaces unsupported chars with hyphens, trims hyphens, caps at 100 chars.
 */
export function sanitizeRepoName(name: string): string {
  const replaced = name.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return replaced.replace(/^-+|-+$/g, "").slice(0, 100);
}
