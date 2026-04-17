import { useAuthStore } from "@features/auth/stores/authStore";
import { getCloudUrlFromRegion } from "@shared/utils/urls";

export function getPostHogUrl(path: string): string {
  const region = useAuthStore.getState().cloudRegion;
  const base = region ? getCloudUrlFromRegion(region) : "http://localhost:8010";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
