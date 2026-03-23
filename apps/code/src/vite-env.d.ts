/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;

  // PostHog Analytics
  readonly VITE_POSTHOG_API_KEY?: string;
  readonly VITE_POSTHOG_API_HOST?: string;
  readonly VITE_POSTHOG_UI_HOST?: string;
}

// This interface is used by TypeScript to type-check `import.meta.env` in Vite.
// It appears unused in this file, but it is intentionally kept for global augmentation.
// biome-ignore lint: noUnusedVariables
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
