import type { ExternalAppType } from "@shared/types";

export interface AppDefinition {
  path: string;
  type: ExternalAppType;
}

export interface ExternalAppsPreferences {
  lastUsedApp?: string;
}

export interface ExternalAppsSchema {
  externalAppsPrefs: ExternalAppsPreferences;
}
