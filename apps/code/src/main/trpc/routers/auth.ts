import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import { AuthEvent, storedTokensInput } from "../../services/auth/schemas";
import type { AuthService } from "../../services/auth/service";
import { publicProcedure, router } from "../trpc";

const getService = () => container.get<AuthService>(MAIN_TOKENS.AuthService);

export const authRouter = router({
  getAccessToken: publicProcedure.query(() => {
    return { accessToken: getService().getAccessToken() };
  }),

  setTokens: publicProcedure.input(storedTokensInput).mutation(({ input }) => {
    getService().setTokens(input);
  }),

  clearTokens: publicProcedure.mutation(() => {
    getService().clearTokens();
  }),

  refreshAccessToken: publicProcedure.mutation(async () => {
    const service = getService();
    await service.refreshAccessToken();
    return { accessToken: service.getAccessToken()! };
  }),

  onTokenUpdated: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(AuthEvent.TokenUpdated, {
      signal: opts.signal,
    })) {
      yield data;
    }
  }),

  onAuthError: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(AuthEvent.AuthError, {
      signal: opts.signal,
    })) {
      yield data;
    }
  }),

  onLogout: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(AuthEvent.Logout, {
      signal: opts.signal,
    })) {
      yield data;
    }
  }),
});
