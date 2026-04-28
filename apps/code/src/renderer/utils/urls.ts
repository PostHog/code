import { useAuthStore } from "@features/auth/stores/authStore";
import type { CloudRegion } from "@shared/types/regions";
import { getCloudUrlFromRegion } from "@shared/utils/urls";

export function getPostHogUrl(
  path: string,
  regionOverride?: CloudRegion | null,
): string {
  const region = regionOverride ?? useAuthStore.getState().cloudRegion;
  const base = region ? getCloudUrlFromRegion(region) : "http://localhost:8010";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
