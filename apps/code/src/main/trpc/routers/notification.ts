import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import type { NotificationService } from "../../services/notification/service";
import { publicProcedure, router } from "../trpc";

const getService = () =>
  container.get<NotificationService>(MAIN_TOKENS.NotificationService);

export const notificationRouter = router({
  send: publicProcedure
    .input(
      z.object({
        title: z.string(),
        body: z.string(),
        silent: z.boolean(),
        taskId: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      getService().send(input.title, input.body, input.silent, input.taskId),
    ),
  showDockBadge: publicProcedure.mutation(() => getService().showDockBadge()),
  bounceDock: publicProcedure.mutation(() => getService().bounceDock()),
});
