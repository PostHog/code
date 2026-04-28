import type { Manifest } from "@main/services/scratchpad/schemas";

/**
 * The manifest is the single source of truth for whether a scratchpad is a
 * draft. A missing or unreadable manifest is treated as not-draft.
 */
export function isDraftFromManifest(
  manifest: Manifest | null | undefined,
): boolean {
  return manifest?.published === false;
}
