export type CloudRegion = "us" | "eu" | "dev";

export const REGION_LABELS: Record<CloudRegion, string> = {
  us: "🇺🇸 US Cloud",
  eu: "🇪🇺 EU Cloud",
  dev: "🛠️ Development",
};
