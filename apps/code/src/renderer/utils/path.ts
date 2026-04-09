/**
 * Cross-platform check for absolute file paths.
 * Handles both Unix (/path) and Windows (C:\path) formats.
 */
export function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith("/") || /^[a-zA-Z]:/.test(filePath);
}

/**
 * Convert an absolute file path to a path relative to the repo root.
 * Normalizes separators to forward slashes before comparison so this
 * works on both Unix and Windows.
 */
export function toRelativePath(filePath: string, repoPath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const normalizedRepo = repoPath.replaceAll("\\", "/");
  return normalized.startsWith(`${normalizedRepo}/`)
    ? normalized.slice(normalizedRepo.length + 1)
    : normalized;
}

export function expandTildePath(path: string): string {
  if (typeof path !== "string") return String(path);
  if (!path.startsWith("~")) return path;
  // In renderer context, we can't access process.env directly
  // For now, return the path as-is since the main process will handle expansion
  // Or we could use a pattern like /Users/username or /home/username
  // The actual expansion should happen on the Electron main side
  return path;
}

export function compactHomePath(text: string): string {
  if (typeof text !== "string") return String(text);
  return text
    .replace(/\/Users\/[^/\s]+/g, "~")
    .replace(/\/home\/[^/\s]+/g, "~");
}

export function getFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

export function getFileExtension(filePath: string): string {
  const name = getFileName(filePath);
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : "";
}
