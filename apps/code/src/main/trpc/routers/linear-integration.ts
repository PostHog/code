import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  startLinearFlowInput,
  startLinearFlowOutput,
} from "../../services/linear-integration/schemas.js";
import type { LinearIntegrationService } from "../../services/linear-integration/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<LinearIntegrationService>(MAIN_TOKENS.LinearIntegrationService);

export const linearIntegrationRouter = router({
  startFlow: publicProcedure
    .input(startLinearFlowInput)
    .output(startLinearFlowOutput)
    .mutation(({ input }) =>
      getService().startFlow(input.region, input.projectId),
    ),
});
