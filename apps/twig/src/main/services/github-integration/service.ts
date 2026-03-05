import * as http from "node:http";
import type { Socket } from "node:net";
import { getCloudUrlFromRegion } from "@shared/constants/oauth.js";
import { shell } from "electron";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../utils/logger.js";
import type { DeepLinkService } from "../deep-link/service.js";
import type {
  CancelGitHubFlowOutput,
  CloudRegion,
  StartGitHubFlowOutput,
} from "./schemas.js";

const log = logger.scope("github-integration-service");

const PROTOCOL = "twig";
const TIMEOUT_MS = 300_000; // 5 minutes
const DEV_CALLBACK_PORT = 8238; // Different from OAuth's 8237

// Use HTTP callback in development, deep link in production
const IS_DEV = process.defaultApp || false;

interface PendingFlow {
  resolve: (success: boolean) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  server?: http.Server;
  connections?: Set<Socket>;
}

@injectable()
export class GitHubIntegrationService {
  private pendingFlow: PendingFlow | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
  ) {
    this.deepLinkService.registerHandler("github-connected", () =>
      this.handleCallback(),
    );
    log.info("Registered github-connected handler for deep links");
  }

  private handleCallback(): boolean {
    if (!this.pendingFlow) {
      log.warn("Received GitHub callback but no pending flow");
      return false;
    }
    const { resolve, timeoutId } = this.pendingFlow;
    clearTimeout(timeoutId);
    this.pendingFlow = null;
    resolve(true);
    return true;
  }

  private getCallbackUrl(): string {
    return IS_DEV
      ? `http://localhost:${DEV_CALLBACK_PORT}/github-callback`
      : `${PROTOCOL}://github-connected`;
  }

  public async startFlow(
    region: CloudRegion,
    projectId: number,
  ): Promise<StartGitHubFlowOutput> {
    try {
      this.cancelFlow();

      const cloudUrl = getCloudUrlFromRegion(region);
      const callbackUrl = this.getCallbackUrl();
      const authorizeUrl = `${cloudUrl}/api/environments/${projectId}/integrations/authorize/?kind=github&next=${encodeURIComponent(callbackUrl)}`;

      const success = IS_DEV
        ? await this.waitForHttpCallback(authorizeUrl)
        : await this.waitForDeepLinkCallback(authorizeUrl);

      return { success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public cancelFlow(): CancelGitHubFlowOutput {
    try {
      if (this.pendingFlow) {
        if (this.pendingFlow.server) {
          this.cleanupHttpServer();
        } else {
          clearTimeout(this.pendingFlow.timeoutId);
          this.pendingFlow.reject(new Error("GitHub flow cancelled"));
          this.pendingFlow = null;
        }
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async waitForDeepLinkCallback(
    authorizeUrl: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingFlow = null;
        reject(new Error("Authorization timed out"));
      }, TIMEOUT_MS);

      this.pendingFlow = { resolve, reject, timeoutId };

      shell.openExternal(authorizeUrl).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingFlow = null;
        reject(new Error(`Failed to open browser: ${error.message}`));
      });
    });
  }

  private async waitForHttpCallback(authorizeUrl: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const connections = new Set<Socket>();

      const server = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://localhost:${DEV_CALLBACK_PORT}`);

        if (url.pathname === "/github-callback") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(this.getCallbackHtml());
          this.cleanupHttpServer();
          resolve(true);
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
        reject(new Error("Authorization timed out"));
      }, TIMEOUT_MS);

      this.pendingFlow = { resolve, reject, timeoutId, server, connections };

      server.listen(DEV_CALLBACK_PORT, () => {
        log.info(
          `Dev GitHub callback server listening on port ${DEV_CALLBACK_PORT}`,
        );
        shell.openExternal(authorizeUrl).catch((error) => {
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

  private getCallbackHtml(): string {
    return `<!DOCTYPE html>
<html class="radix-themes" data-is-root-theme="true" data-accent-color="orange" data-gray-color="slate" data-has-background="true" data-panel-background="translucent" data-radius="none" data-scaling="100%">
  <head>
    <meta charset="utf-8">
    <title>GitHub connected</title>
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
    <h1 class="text-gray-12 text-xl font-semibold">GitHub connected!</h1>
    <p class="text-gray-11 text-sm">You can close this window and return to PostHog Code.</p>
    <script>setTimeout(() => window.close(), 500);</script>
  </body>
</html>`;
  }

  private cleanupHttpServer(): void {
    if (this.pendingFlow?.server) {
      if (this.pendingFlow.connections) {
        for (const conn of this.pendingFlow.connections) {
          conn.destroy();
        }
        this.pendingFlow.connections.clear();
      }
      this.pendingFlow.server.close();
    }
    if (this.pendingFlow?.timeoutId) {
      clearTimeout(this.pendingFlow.timeoutId);
    }
    this.pendingFlow = null;
  }
}
