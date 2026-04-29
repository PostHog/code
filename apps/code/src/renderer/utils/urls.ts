import { useAuthStore } from "@features/auth/stores/authStore";
import type { CloudRegion } from "@shared/types/regions";
import { getCloudUrlFromRegion } from "@shared/utils/urls";

export function getPostHogUrl(
  path: string,
  regionOverride?: CloudRegion | null,
): string | null {
  const region = regionOverride ?? useAuthStore.getState().cloudRegion;
  if (!region) return null;
  const base = getCloudUrlFromRegion(region);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
