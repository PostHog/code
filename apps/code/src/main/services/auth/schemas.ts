import { z } from "zod";
import { cloudRegion, oAuthErrorCode } from "../oauth/schemas";

export const storedTokensInput = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  cloudRegion: cloudRegion,
  scopedTeams: z.array(z.number()).optional(),
  scopeVersion: z.number().optional(),
});

export const tokenUpdatedPayload = z.object({
  accessToken: z.string(),
});

export const authErrorPayload = z.object({
  reason: z.string(),
  errorCode: oAuthErrorCode,
});

export enum AuthEvent {
  TokenUpdated = "tokenUpdated",
  AuthError = "authError",
  Logout = "logout",
}
