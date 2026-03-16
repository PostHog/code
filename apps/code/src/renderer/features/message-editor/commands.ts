import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { getSessionService } from "@features/sessions/service/service";
import { ANALYTICS_EVENTS, type FeedbackType } from "@shared/types/analytics";
import { track } from "@utils/analytics";
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

interface CodeCommand {
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
): CodeCommand {
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

const commands: CodeCommand[] = [
  makeFeedbackCommand("good", "good", "Positive"),
  makeFeedbackCommand("bad", "bad", "Negative"),
  makeFeedbackCommand("feedback", "general", "General"),
  {
    name: "clear",
    description: "Clear conversation history and start fresh",
    async execute(_args, ctx) {
      if (!ctx.repoPath || !ctx.taskId) {
        toast.error("Cannot clear: no active session");
        return;
      }
      await getSessionService().resetSession(ctx.taskId, ctx.repoPath);
      toast.success("Conversation cleared");
    },
  },
];

export const CODE_COMMANDS: AvailableCommand[] = commands.map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  input: cmd.input,
}));

const commandMap = new Map(commands.map((cmd) => [cmd.name, cmd]));

export async function tryExecuteCodeCommand(
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
