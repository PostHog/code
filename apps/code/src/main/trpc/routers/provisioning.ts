import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import {
  ProvisioningEvent,
  type ProvisioningService,
} from "../../services/provisioning/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<ProvisioningService>(MAIN_TOKENS.ProvisioningService);

export const provisioningRouter = router({
  onOutput: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    for await (const data of service.toIterable(ProvisioningEvent.Output, {
      signal: opts.signal,
    })) {
      yield data;
    }
  }),
});
