import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  ConnectivityEvent,
  type ConnectivityEvents,
  connectivityStatusOutput,
} from "../../services/connectivity/schemas";
import type { ConnectivityService } from "../../services/connectivity/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<ConnectivityService>(MAIN_TOKENS.ConnectivityService);

function subscribe<K extends keyof ConnectivityEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const connectivityRouter = router({
  getStatus: publicProcedure.output(connectivityStatusOutput).query(() => {
    const service = getService();
    return service.getStatus();
  }),

  checkNow: publicProcedure
    .output(connectivityStatusOutput)
    .mutation(async () => {
      const service = getService();
      return service.checkNow();
    }),

  onStatusChange: subscribe(ConnectivityEvent.StatusChange),
});
