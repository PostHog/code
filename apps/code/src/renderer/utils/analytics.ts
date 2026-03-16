import posthog from "posthog-js/dist/module.full.no-external";
// Import the recorder to set up __PosthogExtensions__.initSessionRecording
// The module.full.no-external bundle includes rrweb but not the initSessionRecording function
// posthog-recorder (vs lazy-recorder) ensures recording is ready immediately
import "posthog-js/dist/posthog-recorder";
import type { PermissionRequest } from "@renderer/features/sessions/utils/parseSessionLogs";
import type {
  EventPropertyMap,
  UserIdentifyProperties,
} from "@shared/types/analytics";
import { logger } from "./logger";

const log = logger.scope("analytics");

let isInitialized = false;

export function initializePostHog() {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const apiHost =
    import.meta.env.VITE_POSTHOG_API_HOST || "https://internal-c.posthog.com";
  const uiHost =
    import.meta.env.VITE_POSTHOG_UI_HOST || "https://us.i.posthog.com";

  if (!apiKey || isInitialized) {
    return;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    ui_host: uiHost,
    disable_session_recording: false,
    capture_exceptions: import.meta.env.DEV
      ? false
      : {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: true,
        },
    loaded: () => {
      log.info("PostHog loaded");
      posthog.startSessionRecording();
      log.info("Session recording started");
    },
  });

  posthog.register({ team: "posthog-code" });

  isInitialized = true;
}

/**
 * Log the current session recording status for debugging
 */
export function logSessionRecordingStatus() {
  if (!isInitialized) {
    log.warn("PostHog not initialized");
    return;
  }

  const sessionRecording = posthog.sessionRecording;
  const remoteConfig = posthog.get_property("$session_recording_remote_config");

  log.info("Session Recording Debug:", {
    started: sessionRecording?.started,
    status: sessionRecording?.status,
    remoteConfigEnabled: remoteConfig?.enabled,
    remoteConfig,
    windowLocationHref: window.location?.href,
    configDisableSessionRecording: posthog.config?.disable_session_recording,
  });
}

/**
 * Manually start session recording.
 * Use this to force start recording regardless of triggers.
 */
export function startSessionRecording() {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot start session recording");
    return;
  }

  log.info("Attempting to start session recording...");

  // Use PostHog's startSessionRecording API which overrides triggers
  posthog.startSessionRecording();

  // Log status after attempting to start
  setTimeout(() => {
    log.info("Session recording status after manual start:");
    logSessionRecordingStatus();
  }, 1000);
}

export function identifyUser(
  userId: string,
  properties?: UserIdentifyProperties,
) {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot identify user");
    return;
  }

  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot reset user");
    return;
  }

  posthog.reset();
}

export function track<K extends keyof EventPropertyMap>(
  eventName: K,
  ...args: EventPropertyMap[K] extends never
    ? []
    : EventPropertyMap[K] extends undefined
      ? [properties?: EventPropertyMap[K]]
      : [properties: EventPropertyMap[K]]
) {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot track event");
    return;
  }

  posthog.capture(eventName, args[0]);
}

/**
 * Build tool metadata for analytics on permission requests
 */
export function buildPermissionToolMetadata(
  permission?: PermissionRequest,
  selectedOptionId?: string,
  customInput?: string,
): Record<string, any> {
  const selectedOption = permission?.options?.find(
    (o) => o.optionId === selectedOptionId,
  );
  const rawInput = permission?.toolCall?.rawInput as
    | Record<string, unknown>
    | undefined;

  return {
    tool_name: rawInput?.toolName,
    option_id: selectedOptionId,
    option_kind: selectedOption?.kind ?? "unknown",
    custom_input: customInput,
  };
}

/**
 * Capture an exception for error tracking using PostHog's built-in exception tracking.
 */
export function captureException(
  error: Error,
  additionalProperties?: Record<string, unknown>,
) {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot capture exception");
    return;
  }

  posthog.captureException(error, {
    team: "posthog-code",
    ...additionalProperties,
  });
}

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Check if a feature flag is enabled for the current user.
 * Returns false if PostHog is not initialized or flag is not found.
 */
export function isFeatureFlagEnabled(flagKey: string): boolean {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot check feature flag");
    return false;
  }

  return posthog.isFeatureEnabled(flagKey) ?? false;
}

/**
 * Subscribe to feature flag changes.
 * Callback is called when flags are loaded or updated.
 * Returns unsubscribe function.
 */
export function onFeatureFlagsLoaded(callback: () => void): () => void {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot subscribe to feature flags");
    return () => {};
  }

  return posthog.onFeatureFlags(callback);
}

/**
 * Reload feature flags from the server.
 * Useful after a person property change (e.g., invite code redemption).
 */
export function reloadFeatureFlags(): void {
  if (!isInitialized) {
    return;
  }

  posthog.reloadFeatureFlags();
}
