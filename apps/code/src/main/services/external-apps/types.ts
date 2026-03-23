import type { ExternalAppType } from "@shared/types";

export interface AppDefinition {
  type: ExternalAppType;
  darwin?: { path: string };
  win32?: { paths: string[]; exeName?: string };
}

export interface ExternalAppsPreferences {
  lastUsedApp?: string;
}

export interface ExternalAppsSchema {
  externalAppsPrefs: ExternalAppsPreferences;
}
