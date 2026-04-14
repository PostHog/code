import * as http from "node:http";
import type { Socket } from "node:net";
import type { IUrlLauncher } from "@posthog/platform/url-launcher";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { DeepLinkService } from "../deep-link/service";
import {
  type GetCallbackUrlOutput,
  McpCallbackEvent,
  type McpCallbackEvents,
  type McpCallbackResult,
  type OpenAndWaitOutput,
} from "./schemas";

const log = logger.scope("mcp-callback");

const PROTOCOL = "posthog-code";
const MCP_CALLBACK_KEY = "mcp-oauth-complete";
const DEV_CALLBACK_PORT = 8238;
const OAUTH_TIMEOUT_MS = 180_000; // 3 minutes

// Use HTTP callback in development, deep link in production
const IS_DEV = process.defaultApp || false;

interface PendingCallback {
  resolve: (result: McpCallbackResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  server?: http.Server;
  connections?: Set<Socket>;
}

@injectable()
export class McpCallbackService extends TypedEventEmitter<McpCallbackEvents> {
  private pendingCallback: PendingCallback | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
    @inject(MAIN_TOKENS.UrlLauncher)
    private readonly urlLauncher: IUrlLauncher,
  ) {
    super();
    // Register deep link handler for MCP OAuth callbacks (production)
    this.deepLinkService.registerHandler(
      MCP_CALLBACK_KEY,
      (_path, searchParams) => this.handleCallback(searchParams),
    );
    log.info("Registered MCP OAuth callback handler for deep links");
  }

  /**
   * Get the callback URL based on environment (dev vs prod).
   */
  public getCallbackUrl(): GetCallbackUrlOutput {
    const callbackUrl = IS_DEV
      ? `http://localhost:${DEV_CALLBACK_PORT}/${MCP_CALLBACK_KEY}`
      : `${PROTOCOL}://${MCP_CALLBACK_KEY}`;
    return { callbackUrl };
  }

  /**
   * Open the OAuth authorization URL in the browser and wait for the callback.
   * In dev mode, starts a local HTTP server. In production, uses deep links.
   */
  public async openAndWaitForCallback(
    redirectUrl: string,
  ): Promise<OpenAndWaitOutput> {
    try {
      // Cancel any existing pending callback
      this.cancelPending();

      const result = IS_DEV
        ? await this.waitForHttpCallback(redirectUrl)
        : await this.waitForDeepLinkCallback(redirectUrl);

      // Emit event for any subscribers
      this.emit(McpCallbackEvent.OAuthComplete, result);

      return {
        success: result.status === "success",
        installationId: result.installationId,
        error: result.error,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  }

  private handleCallback(searchParams: URLSearchParams): boolean {
    const status = searchParams.get("status") as "success" | "error" | null;
    const installationId = searchParams.get("installation_id") ?? undefined;
    const error = searchParams.get("error") ?? undefined;

    if (!this.pendingCallback) {
      log.warn("Received MCP OAuth callback but no pending flow");
      return false;
    }

    const { resolve, timeoutId } = this.pendingCallback;
    clearTimeout(timeoutId);
    this.pendingCallback = null;

    const result: McpCallbackResult = {
      status: status === "success" ? "success" : "error",
      installationId,
      error,
    };
    resolve(result);
    return true;
  }

  /**
   * Wait for callback via deep link (production).
   */
  private async waitForDeepLinkCallback(
    redirectUrl: string,
  ): Promise<McpCallbackResult> {
    return new Promise<McpCallbackResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCallback = null;
        reject(new Error("MCP OAuth authorization timed out"));
      }, OAUTH_TIMEOUT_MS);

      this.pendingCallback = {
        resolve,
        reject,
        timeoutId,
      };

      // Open the browser for authentication
      this.urlLauncher.launch(redirectUrl).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingCallback = null;
        reject(new Error(`Failed to open browser: ${error.message}`));
      });
    });
  }

  /**
   * Wait for callback via HTTP server (development).
   */
  private async waitForHttpCallback(
    redirectUrl: string,
  ): Promise<McpCallbackResult> {
    return new Promise<McpCallbackResult>((resolve, reject) => {
      const connections = new Set<Socket>();

      const server = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://localhost:${DEV_CALLBACK_PORT}`);

        if (url.pathname === `/${MCP_CALLBACK_KEY}`) {
          const status = url.searchParams.get("status") as
            | "success"
            | "error"
            | null;
          const installationId =
            url.searchParams.get("installation_id") ?? undefined;
          const error = url.searchParams.get("error") ?? undefined;

          const callbackStatus = status === "success" ? "success" : "error";

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            this.getCallbackHtml(
              callbackStatus === "success" ? "success" : "error",
            ),
          );

          this.cleanupHttpServer();

          resolve({
            status: callbackStatus,
            installationId,
            error,
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      server.on("connection", (conn) => {
        connections.add(conn);
        conn.on("close", () => connections.delete(conn));
      });

      const timeoutId = setTimeout(() => {
        this.cleanupHttpServer();
        reject(new Error("MCP OAuth authorization timed out"));
      }, OAUTH_TIMEOUT_MS);

      this.pendingCallback = {
        resolve,
        reject,
        timeoutId,
        server,
        connections,
      };

      server.listen(DEV_CALLBACK_PORT, () => {
        log.info(
          `Dev MCP OAuth callback server listening on port ${DEV_CALLBACK_PORT}`,
        );
        // Open the browser for authentication
        this.urlLauncher.launch(redirectUrl).catch((error) => {
          this.cleanupHttpServer();
          reject(new Error(`Failed to open browser: ${error.message}`));
        });
      });

      server.on("error", (error) => {
        this.cleanupHttpServer();
        reject(new Error(`Failed to start callback server: ${error.message}`));
      });
    });
  }

  /**
   * Generate HTML for the callback page (dev mode).
   */
  private getCallbackHtml(status: "success" | "error"): string {
    const titles = {
      success: "Authorization successful!",
      error: "Authorization failed",
    };
    const messages = {
      success: "You can close this window and return to PostHog Code.",
      error: "You can close this window and return to PostHog Code.",
    };

    return `<!DOCTYPE html>
<html class="radix-themes" data-is-root-theme="true" data-accent-color="orange" data-gray-color="slate" data-has-background="true" data-panel-background="translucent" data-radius="none" data-scaling="100%">
  <head>
    <meta charset="utf-8">
    <title>${titles[status]}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@radix-ui/themes@3.1.6/styles.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @layer utilities {
        .text-gray-12 { color: var(--gray-12); }
        .text-gray-11 { color: var(--gray-11); }
        .bg-gray-1 { background-color: var(--gray-1); }
      }
    </style>
  </head>
  <body class="dark bg-gray-1 h-screen overflow-hidden flex flex-col items-center justify-center m-0 gap-2">
    <h1 class="text-gray-12 text-xl font-semibold">${titles[status]}</h1>
    <p class="text-gray-11 text-sm">${messages[status]}</p>
    <script>setTimeout(() => window.close(), 500);</script>
  </body>
</html>`;
  }

  /**
   * Clean up HTTP server used in development.
   */
  private cleanupHttpServer(): void {
    if (this.pendingCallback?.server) {
      if (this.pendingCallback.connections) {
        for (const conn of this.pendingCallback.connections) {
          conn.destroy();
        }
        this.pendingCallback.connections.clear();
      }
      this.pendingCallback.server.close();
    }
    if (this.pendingCallback?.timeoutId) {
      clearTimeout(this.pendingCallback.timeoutId);
    }
    this.pendingCallback = null;
  }

  /**
   * Cancel any pending callback.
   */
  private cancelPending(): void {
    if (this.pendingCallback) {
      if (this.pendingCallback.server) {
        this.cleanupHttpServer();
      } else {
        clearTimeout(this.pendingCallback.timeoutId);
        this.pendingCallback.reject(new Error("MCP OAuth flow cancelled"));
        this.pendingCallback = null;
      }
    }
  }
}
