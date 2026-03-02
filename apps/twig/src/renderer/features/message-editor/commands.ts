import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { track } from "@renderer/lib/analytics";
import { ANALYTICS_EVENTS, type FeedbackType } from "@shared/types/analytics";
import { toast } from "@utils/toast";

interface CommandContext {
  taskId: string;
  repoPath: string | null | undefined;
  session: {
    taskRunId?: string;
    logUrl?: string;
    events: unknown[];
  } | null;
  taskRun: { id?: string; log_url?: string } | null;
}

interface TwigCommand {
  name: string;
  description: string;
  input?: { hint: string };
  execute: (
    args: string | undefined,
    context: CommandContext,
  ) => Promise<void> | void;
}

function makeFeedbackCommand(
  name: string,
  feedbackType: FeedbackType,
  label: string,
): TwigCommand {
  return {
    name,
    description: `Capture ${label.toLowerCase()} feedback`,
    input: { hint: "optional comment" },
    execute(args, ctx) {
      track(ANALYTICS_EVENTS.TASK_FEEDBACK, {
        task_id: ctx.taskId,
        task_run_id: ctx.session?.taskRunId ?? ctx.taskRun?.id,
        log_url: ctx.session?.logUrl ?? ctx.taskRun?.log_url,
        event_count: ctx.session?.events.length ?? 0,
        feedback_type: feedbackType,
        feedback_comment: args?.trim() || undefined,
      });
      toast.success(`${label} feedback captured`);
    },
  };
}

const commands: TwigCommand[] = [
  makeFeedbackCommand("good", "good", "Positive"),
  makeFeedbackCommand("bad", "bad", "Negative"),
  makeFeedbackCommand("feedback", "general", "General"),
];

export const TWIG_COMMANDS: AvailableCommand[] = commands.map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  input: cmd.input,
}));

const commandMap = new Map(commands.map((cmd) => [cmd.name, cmd]));

export async function tryExecuteTwigCommand(
  text: string,
  context: CommandContext,
): Promise<boolean> {
  const match = text.match(/^\/(\S+)(?:\s+(.*))?$/);
  if (!match) return false;

  const cmd = commandMap.get(match[1]);
  if (!cmd) return false;

  await cmd.execute(match[2], context);
  return true;
}
