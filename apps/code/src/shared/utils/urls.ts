import { useAuthStore } from "@features/auth/stores/authStore";
import type { CloudRegion } from "@shared/types/regions";

export function getCloudUrlFromRegion(region: CloudRegion): string {
  switch (region) {
    case "us":
      return "https://us.posthog.com";
    case "eu":
      return "https://eu.posthog.com";
    case "dev":
      return "http://localhost:8010";
  }
}

export function getPostHogUrl(path: string): string {
  const region = useAuthStore.getState().cloudRegion;
  const base = region
    ? getCloudUrlFromRegion(region)
    : "http://localhost:8010";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
