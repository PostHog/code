import Constants from "expo-constants";
import { useAuthStore } from "@/features/auth";

const USER_AGENT = `posthog/mobile.hog.dev; version: ${Constants.expoConfig?.version ?? "unknown"}`;

export function getHeaders(): Record<string, string> {
  const { oauthAccessToken } = useAuthStore.getState();
  if (!oauthAccessToken) {
    throw new Error("Not authenticated");
  }
  return {
    Authorization: `Bearer ${oauthAccessToken}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
}

export function getBaseUrl(): string {
  const { cloudRegion, getCloudUrlFromRegion } = useAuthStore.getState();
  if (!cloudRegion) {
    throw new Error("No cloud region set");
  }
  return getCloudUrlFromRegion(cloudRegion);
}

export function getProjectId(): number {
  const { projectId } = useAuthStore.getState();
  if (!projectId) {
    throw new Error("No project ID set");
  }
  return projectId;
}
