import http from "node:http";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import type { AuthService } from "../auth/service";

const log = logger.scope("mcp-proxy");

/**
 * Local HTTP proxy for MCP servers. Allows routing MCP requests through a
 * stable loopback URL while injecting a fresh access token on every forwarded
 * request. MCP transports bake their headers at construction time, so without
 * this proxy we would either need to tear the transport down on every token
 * rotation (expensive, racy) or leave it serving stale tokens.
 */
@injectable()
export class McpProxyService {
  private server: http.Server | null = null;
  private port: number | null = null;
  private targets = new Map<string, string>();

  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly authService: AuthService,
  ) {}

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise<void>((resolve, reject) => {
      this.server?.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
          log.info("MCP proxy started", { port: this.port });
          resolve();
        } else {
          reject(new Error("Failed to get proxy address"));
        }
      });

      this.server?.on("error", (err) => {
        log.error("MCP proxy server error", err);
        reject(err);
      });
    });
  }

  /**
   * Register a target URL under a stable ID. Returns the loopback URL that
   * should be passed to the MCP transport. Subsequent registrations with the
   * same ID overwrite the target.
   */
  register(id: string, targetUrl: string): string {
    if (!this.port) {
      throw new Error("MCP proxy not started");
    }
    this.targets.set(id, targetUrl);
    return `http://127.0.0.1:${this.port}/${encodeURIComponent(id)}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server?.close(() => {
        log.info("MCP proxy stopped");
        this.server = null;
        this.port = null;
        this.targets.clear();
        resolve();
      });
    });
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    const incoming = req.url ?? "/";
    const [, rawId, ...rest] = incoming.split("/");
    const id = rawId ? decodeURIComponent(rawId) : "";
    const target = this.targets.get(id);

    if (!target) {
      log.warn("Unknown MCP proxy target", { id, url: incoming });
      res.writeHead(404);
      res.end("Unknown target");
      return;
    }

    const suffix = rest.join("/");
    const targetUrl = suffix ? `${target}/${suffix}` : target;

    const strippedAuthHeaders = new Set([
      "authorization",
      "proxy-authorization",
    ]);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key === "host" ||
        key === "connection" ||
        strippedAuthHeaders.has(key)
      ) {
        continue;
      }
      if (typeof value === "string") {
        headers[key] = value;
      }
    }

    const fetchOptions: RequestInit = {
      method: req.method ?? "GET",
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        fetchOptions.body = Buffer.concat(chunks);
        this.forwardRequest(id, targetUrl, fetchOptions, res);
      });
    } else {
      this.forwardRequest(id, targetUrl, fetchOptions, res);
    }
  }

  private async forwardRequest(
    id: string,
    url: string,
    options: RequestInit,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      const preToken = await this.authService.getValidAccessToken();
      log.info("MCP proxy BEFORE request", {
        id,
        url,
        tokenPrefix: preToken.accessToken.slice(0, 16),
        tokenSuffix: preToken.accessToken.slice(-8),
        tokenLength: preToken.accessToken.length,
      });

      let response = await this.authService.authenticatedFetch(
        fetch,
        url,
        options,
      );

      const postToken = await this.authService.getValidAccessToken();
      log.info("MCP proxy AFTER request", {
        id,
        url,
        tokenPrefix: postToken.accessToken.slice(0, 16),
        tokenSuffix: postToken.accessToken.slice(-8),
        tokenLength: postToken.accessToken.length,
        tokenChangedDuringRequest:
          preToken.accessToken !== postToken.accessToken,
      });

      // MCP servers return HTTP 200 with auth failures encoded in the JSON-RPC
      // body, so authenticatedFetch's 401/403 retry never kicks in. Detect the
      // known error shape and retry once with a force-refreshed token.
      const contentType = response.headers.get("content-type") ?? "";
      const isSse = contentType.includes("text/event-stream");

      if (!isSse) {
        const buf = Buffer.from(await response.arrayBuffer());
        const bodyText = buf.toString("utf8");

        if (this.isAuthErrorBody(bodyText)) {
          log.warn("MCP auth error in body — refreshing token and retrying", {
            id,
            url,
          });
          await this.authService.refreshAccessToken();
          response = await this.authService.authenticatedFetch(
            fetch,
            url,
            options,
          );
          const retryContentType = response.headers.get("content-type") ?? "";
          if (!retryContentType.includes("text/event-stream")) {
            const retryBuf = Buffer.from(await response.arrayBuffer());
            this.writeBufferedResponse(response, retryBuf, res);
            return;
          }
          // Fall through to streaming path below for SSE retry responses.
          this.writeStreamingResponse(response, res);
          return;
        }

        if (/"isError"\s*:\s*true/.test(bodyText) || response.status >= 400) {
          log.warn("MCP proxy non-OK body", {
            id,
            url,
            status: response.status,
            body: bodyText.slice(0, 2000),
          });
        } else {
          log.debug("MCP proxy response", {
            id,
            url,
            status: response.status,
          });
        }

        this.writeBufferedResponse(response, buf, res);
        return;
      }

      log.debug("MCP proxy response", {
        id,
        url,
        status: response.status,
        streaming: true,
      });
      this.writeStreamingResponse(response, res);
    } catch (err) {
      log.error("MCP proxy forward error", { id, url, err });
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end("Proxy error");
    }
  }

  private isAuthErrorBody(bodyText: string): boolean {
    return (
      bodyText.includes('"authentication_failed"') ||
      bodyText.includes('"authentication_error"')
    );
  }

  private buildResponseHeaders(response: Response): Record<string, string> {
    const stripHeaders = new Set([
      "transfer-encoding",
      "content-encoding",
      "content-length",
    ]);
    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      if (stripHeaders.has(key)) return;
      headers[key] = value;
    });
    return headers;
  }

  private writeBufferedResponse(
    response: Response,
    buf: Buffer,
    res: http.ServerResponse,
  ): void {
    res.writeHead(response.status, this.buildResponseHeaders(response));
    res.end(buf);
  }

  private async writeStreamingResponse(
    response: Response,
    res: http.ServerResponse,
  ): Promise<void> {
    res.writeHead(response.status, this.buildResponseHeaders(response));
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      const canContinue = res.write(value);
      if (canContinue) {
        return pump();
      }
      res.once("drain", () => pump());
    };
    await pump();
  }
}
