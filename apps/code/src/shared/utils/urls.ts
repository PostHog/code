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
