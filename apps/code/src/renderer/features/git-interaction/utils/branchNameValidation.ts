/**
 * Replaces spaces with dashes so users can type natural words and get a
 * valid branch name without thinking about it.
 */
export function sanitizeBranchName(input: string): string {
  return input.replace(/ /g, "-");
}

/**
 * Validates a branch name against the rules in `git check-ref-format`.
 * Returns the first error message found, or `null` when the name is valid.
 * Returns `null` for an empty string — the caller handles the empty case
 * by disabling the submit button.
 */
export function validateBranchName(name: string): string | null {
  if (name === "") return null;

  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching ASCII control characters forbidden by git
  if (/[\x00-\x1f\x7f]/.test(name)) {
    return "Branch name cannot contain control characters.";
  }

  if (name.includes("..")) {
    return 'Branch name cannot contain "..".';
  }

  if (/[~^:?*[\]\\]/.test(name)) {
    return "Branch name cannot contain ~, ^, :, ?, *, [, ], or \\.";
  }

  if (name.includes(" ")) {
    return "Branch name cannot contain spaces.";
  }

  if (name.startsWith(".") || name.endsWith(".")) {
    return "Branch name cannot start or end with a dot.";
  }

  if (name.endsWith(".lock")) {
    return 'Branch name cannot end with ".lock".';
  }

  if (name.includes("@{")) {
    return 'Branch name cannot contain "@{".';
  }

  if (name === "@") {
    return 'Branch name cannot be "@".';
  }

  if (name.includes("//")) {
    return 'Branch name cannot contain "//".';
  }

  const components = name.split("/");
  for (const component of components) {
    if (component.startsWith(".") || component.endsWith(".")) {
      return "Path components cannot start or end with a dot.";
    }
  }

  return null;
}
