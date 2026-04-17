export type GatewayProduct = "posthog_code" | "background_agents";

function getGatewayBaseUrl(posthogHost: string): string {
  const url = new URL(posthogHost);
  const hostname = url.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${url.protocol}//localhost:3308`;
  }

  if (hostname === "host.docker.internal") {
    return `${url.protocol}//host.docker.internal:3308`;
  }

  const region = hostname.match(/^(us|eu)\.posthog\.com$/)?.[1] ?? "us";
  return `https://gateway.${region}.posthog.com`;
}

export function getLlmGatewayUrl(
  posthogHost: string,
  product: GatewayProduct = "posthog_code",
): string {
  return `${getGatewayBaseUrl(posthogHost)}/${product}`;
}

export function getGatewayUsageUrl(
  posthogHost: string,
  product: GatewayProduct = "posthog_code",
): string {
  return `${getGatewayBaseUrl(posthogHost)}/v1/usage/${product}`;
}
