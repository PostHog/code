/** Custom URL scheme for PostHog Code deep links (without `://`). */
export const DEEPLINK_PROTOCOL_PRODUCTION = "posthog-code";
export const DEEPLINK_PROTOCOL_DEVELOPMENT = "posthog-code-dev";

export function getDeeplinkProtocol(isDevBuild: boolean): string {
  return isDevBuild
    ? DEEPLINK_PROTOCOL_DEVELOPMENT
    : DEEPLINK_PROTOCOL_PRODUCTION;
}
