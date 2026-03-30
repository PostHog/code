import { z } from "zod";
import { cloudRegion, type oAuthTokenResponse } from "../oauth/schemas";

export const authStatusSchema = z.enum(["anonymous", "authenticated"]);
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const authStateSchema = z.object({
  status: authStatusSchema,
  bootstrapComplete: z.boolean(),
  cloudRegion: cloudRegion.nullable(),
  projectId: z.number().nullable(),
  availableProjectIds: z.array(z.number()),
  availableOrgIds: z.array(z.string()),
  hasCodeAccess: z.boolean().nullable(),
  needsScopeReauth: z.boolean(),
});
export type AuthState = z.infer<typeof authStateSchema>;

export const loginInput = z.object({
  region: cloudRegion,
});
export type LoginInput = z.infer<typeof loginInput>;

export const loginOutput = z.object({
  state: authStateSchema,
});
export type LoginOutput = z.infer<typeof loginOutput>;

export const redeemInviteCodeInput = z.object({
  code: z.string().min(1),
});

export const selectProjectInput = z.object({
  projectId: z.number(),
});

export const validAccessTokenOutput = z.object({
  accessToken: z.string(),
  apiHost: z.string(),
});
export type ValidAccessTokenOutput = z.infer<typeof validAccessTokenOutput>;

export const AuthServiceEvent = {
  StateChanged: "state-changed",
} as const;

export interface AuthServiceEvents {
  [AuthServiceEvent.StateChanged]: AuthState;
}

export type AuthTokenResponse = z.infer<typeof oAuthTokenResponse>;
