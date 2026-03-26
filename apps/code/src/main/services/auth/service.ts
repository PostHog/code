import {
  getCloudUrlFromRegion,
  TOKEN_REFRESH_BUFFER_MS,
} from "@shared/constants/oauth";
import type { CloudRegion } from "@shared/types/oauth";
import { sleepWithBackoff } from "@shared/utils/backoff";
import { powerMonitor } from "electron";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { OAuthErrorCode, OAuthTokenResponse } from "../oauth/schemas";
import type { OAuthService } from "../oauth/service";

const log = logger.scope("auth-service");

const REFRESH_MAX_RETRIES = 3;
const REFRESH_INITIAL_DELAY_MS = 1000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudRegion: CloudRegion;
  scopedTeams?: number[];
  scopeVersion?: number;
}

export interface AuthServiceEvents {
  tokenUpdated: { accessToken: string };
  authError: { reason: string; errorCode: OAuthErrorCode };
  logout: undefined;
}

@injectable()
export class AuthService extends TypedEventEmitter<AuthServiceEvents> {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;
  private cloudRegion: CloudRegion | null = null;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;

  private readonly onSuspend = () => this.handleSuspend();
  private readonly onResume = () => this.handleResume();

  constructor(
    @inject(MAIN_TOKENS.OAuthService)
    private readonly oauthService: OAuthService,
  ) {
    super();
  }

  setTokens(tokens: StoredTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = tokens.expiresAt;
    this.cloudRegion = tokens.cloudRegion;

    this.emit("tokenUpdated", { accessToken: tokens.accessToken });
    this.scheduleRefresh();
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getCloudRegion(): CloudRegion | null {
    return this.cloudRegion;
  }

  requireAccessToken(): string {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }
    return this.accessToken;
  }

  getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.requireAccessToken()}` };
  }

  getBaseUrl(): string | null {
    if (!this.cloudRegion) return null;
    return getCloudUrlFromRegion(this.cloudRegion);
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  async refreshAccessToken(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  clearTokens(): void {
    this.stopScheduler();
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.cloudRegion = null;
    this.emit("logout", undefined);
  }

  private async doRefresh(): Promise<void> {
    if (!this.refreshToken || !this.cloudRegion) {
      throw new Error("No refresh token available");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < REFRESH_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleepWithBackoff(attempt - 1, {
          initialDelayMs: REFRESH_INITIAL_DELAY_MS,
        });
      }

      const result = await this.attemptRefresh(attempt);

      if (result.ok) {
        this.applyTokenResponse(result.data);
        return;
      }

      if (result.fatal) {
        this.emit("authError", {
          reason: result.error.message,
          errorCode: result.errorCode,
        });
        throw result.error;
      }

      lastError = result.error;
    }

    const error = lastError ?? new Error("Token refresh failed");
    log.error(
      `Token refresh failed after ${REFRESH_MAX_RETRIES} attempts: ${error.message}`,
    );
    this.emit("authError", {
      reason: error.message,
      errorCode: "unknown_error",
    });
    throw error;
  }

  private async attemptRefresh(
    attempt: number,
  ): Promise<
    | { ok: true; data: OAuthTokenResponse }
    | { ok: false; fatal: boolean; error: Error; errorCode: OAuthErrorCode }
  > {
    try {
      const result = await this.oauthService.refreshToken(
        this.refreshToken!,
        this.cloudRegion!,
      );

      if (result.success && result.data) {
        return { ok: true, data: result.data };
      }

      const isRetryable =
        result.errorCode === "network_error" ||
        result.errorCode === "server_error";

      log[isRetryable ? "warn" : "error"](
        `Token refresh ${result.errorCode} (attempt ${attempt + 1}/${REFRESH_MAX_RETRIES}): ${result.error}`,
      );

      return {
        ok: false,
        fatal: !isRetryable,
        error: new Error(result.error || "Token refresh failed"),
        errorCode: result.errorCode || "unknown_error",
      };
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error(String(thrown));
      log.warn(
        `Token refresh exception (attempt ${attempt + 1}): ${error.message}`,
      );
      return {
        ok: false,
        fatal: false,
        error,
        errorCode: "network_error",
      };
    }
  }

  private applyTokenResponse(tokenResponse: OAuthTokenResponse): void {
    this.accessToken = tokenResponse.access_token;
    this.refreshToken = tokenResponse.refresh_token;
    this.tokenExpiry = Date.now() + tokenResponse.expires_in * 1000;

    this.emit("tokenUpdated", { accessToken: tokenResponse.access_token });
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    this.stopScheduler();

    if (!this.tokenExpiry) return;

    powerMonitor.on("suspend", this.onSuspend);
    powerMonitor.on("resume", this.onResume);
    powerMonitor.on("lock-screen", this.onSuspend);
    powerMonitor.on("unlock-screen", this.onResume);

    this.setRefreshTimer();
  }

  private setRefreshTimer(): void {
    this.clearRefreshTimer();

    if (!this.tokenExpiry) return;

    const delayMs = this.tokenExpiry - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    if (delayMs <= 0) {
      this.refreshAccessToken().catch((error) => {
        log.error("Immediate token refresh failed:", error);
      });
      return;
    }

    this.refreshTimerId = setTimeout(() => {
      this.refreshTimerId = null;
      this.refreshAccessToken().catch((error) => {
        log.error("Scheduled token refresh failed:", error);
      });
    }, delayMs);
  }

  private handleSuspend(): void {
    this.clearRefreshTimer();
  }

  private handleResume(): void {
    if (!this.tokenExpiry) return;
    this.setRefreshTimer();
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimerId !== null) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  private stopScheduler(): void {
    this.clearRefreshTimer();
    powerMonitor.off("suspend", this.onSuspend);
    powerMonitor.off("resume", this.onResume);
    powerMonitor.off("lock-screen", this.onSuspend);
    powerMonitor.off("unlock-screen", this.onResume);
  }
}
