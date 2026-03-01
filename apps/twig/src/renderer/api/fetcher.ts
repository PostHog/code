import type { createApiClient } from "./generated";

const USER_AGENT = `posthog/desktop.hog.dev; version: ${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown"}`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly detail: string | undefined,
  ) {
    super(`Failed request: [${status}] ${JSON.stringify(body)}`);
    this.name = "ApiError";
  }
}

function extractDetail(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "detail" in body) {
    return String((body as Record<string, unknown>).detail);
  }
  return undefined;
}

export const buildApiFetcher: (config: {
  apiToken: string;
  onTokenRefresh?: () => Promise<string>;
}) => Parameters<typeof createApiClient>[0] = (config) => {
  let currentToken = config.apiToken;

  const makeRequest = async (
    input: Parameters<Parameters<typeof createApiClient>[0]["fetch"]>[0],
    token: string,
  ): Promise<Response> => {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", USER_AGENT);

    if (input.urlSearchParams) {
      input.url.search = input.urlSearchParams.toString();
    }

    const body = ["post", "put", "patch", "delete"].includes(
      input.method.toLowerCase(),
    )
      ? JSON.stringify(input.parameters?.body)
      : undefined;

    if (input.parameters?.header) {
      for (const [key, value] of Object.entries(input.parameters.header)) {
        if (value != null) {
          headers.set(key, String(value));
        }
      }
    }

    try {
      const response = await fetch(input.url, {
        method: input.method.toUpperCase(),
        ...(body && { body }),
        headers,
        ...input.overrides,
      });

      return response;
    } catch (err) {
      throw new Error(
        `Network request failed for ${input.method.toUpperCase()} ${input.url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
  };

  return {
    fetch: async (input) => {
      let response = await makeRequest(input, currentToken);

      // Handle 401 with automatic token refresh
      if (!response.ok && response.status === 401 && config.onTokenRefresh) {
        try {
          const newToken = await config.onTokenRefresh();
          currentToken = newToken;
          response = await makeRequest(input, currentToken);
        } catch {
          // Token refresh failed - throw the original 401 error
          const errorResponse = await response.json();
          throw new ApiError(
            response.status,
            errorResponse,
            extractDetail(errorResponse),
          );
        }
      }

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new ApiError(
          response.status,
          errorResponse,
          extractDetail(errorResponse),
        );
      }

      return response;
    },
  };
};
