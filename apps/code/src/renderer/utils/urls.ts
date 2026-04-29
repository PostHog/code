import { getCachedAuthState } from "@features/auth/hooks/authQueries";
import type { CloudRegion } from "@shared/types/regions";
import { getCloudUrlFromRegion } from "@shared/utils/urls";

export function getPostHogUrl(
  path: string,
  regionOverride?: CloudRegion | null,
): string | null {
  const region = regionOverride ?? getCachedAuthState().cloudRegion;
  if (!region) return null;
  const base = getCloudUrlFromRegion(region);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
