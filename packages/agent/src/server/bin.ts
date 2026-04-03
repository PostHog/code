#!/usr/bin/env node
import { Command } from "commander";
import { z } from "zod";
import { AgentServer } from "./agent-server";
import { claudeCodeConfigSchema, mcpServersSchema } from "./schemas";

const envSchema = z.object({
  JWT_PUBLIC_KEY: z
    .string({
      error: "JWT_PUBLIC_KEY is required for authenticating client connections",
    })
    .min(1, "JWT_PUBLIC_KEY cannot be empty"),
  POSTHOG_API_URL: z.url({
    error: "POSTHOG_API_URL is required for LLM gateway communication",
  }),
  POSTHOG_PERSONAL_API_KEY: z
    .string({
      error:
        "POSTHOG_PERSONAL_API_KEY is required for authenticating with PostHog services",
    })
    .min(1, "POSTHOG_PERSONAL_API_KEY cannot be empty"),
  POSTHOG_PROJECT_ID: z
    .string({
      error:
        "POSTHOG_PROJECT_ID is required for routing requests to the correct project",
    })
    .regex(/^\d+$/, "POSTHOG_PROJECT_ID must be a numeric string")
    .transform((val) => parseInt(val, 10)),
});

const program = new Command();

function parseJsonOption<S extends z.ZodType>(
  raw: string | undefined,
  schema: S,
  flag: string,
): z.output<S> | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    program.error(`${flag} must be valid JSON`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    program.error(`${flag} validation failed:\n${errors}`);
  }
  return result.data;
}

program
  .name("agent-server")
  .description("PostHog cloud agent server - runs in sandbox environments")
  .option("--port <port>", "HTTP server port", "3001")
  .option(
    "--mode <mode>",
    "Execution mode: interactive or background",
    "interactive",
  )
  .option("--repositoryPath <path>", "Path to the repository")
  .requiredOption("--taskId <id>", "Task ID")
  .requiredOption("--runId <id>", "Task run ID")
  .option(
    "--mcpServers <json>",
    "MCP servers config as JSON array (ACP McpServer[] format)",
  )
  .option("--baseBranch <branch>", "Base branch for PR creation")
  .option(
    "--claudeCodeConfig <json>",
    "Claude Code config as JSON (systemPrompt, systemPromptAppend, plugins)",
  )
  .option(
    "--allowedDomains <domains>",
    "Comma-separated list of domains allowed for web tools (WebFetch, WebSearch)",
  )
  .action(async (options) => {
    const envResult = envSchema.safeParse(process.env);

    if (!envResult.success) {
      const errors = envResult.error.issues
        .map((issue) => `  - ${issue.message}`)
        .join("\n");
      program.error(`Environment validation failed:\n${errors}`);
      return;
    }

    const env = envResult.data;

    const mode = options.mode === "background" ? "background" : "interactive";

    const mcpServers = parseJsonOption(
      options.mcpServers,
      mcpServersSchema,
      "--mcpServers",
    );
    const claudeCode = parseJsonOption(
      options.claudeCodeConfig,
      claudeCodeConfigSchema,
      "--claudeCodeConfig",
    );

    const allowedDomains = options.allowedDomains
      ? options.allowedDomains
          .split(",")
          .map((d: string) => d.trim())
          .filter(Boolean)
      : undefined;

    const server = new AgentServer({
      port: parseInt(options.port, 10),
      jwtPublicKey: env.JWT_PUBLIC_KEY,
      repositoryPath: options.repositoryPath,
      apiUrl: env.POSTHOG_API_URL,
      apiKey: env.POSTHOG_PERSONAL_API_KEY,
      projectId: env.POSTHOG_PROJECT_ID,
      mode,
      taskId: options.taskId,
      runId: options.runId,
      mcpServers,
      baseBranch: options.baseBranch,
      claudeCode,
      allowedDomains,
    });

    process.on("SIGINT", async () => {
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await server.stop();
      process.exit(0);
    });

    await server.start();
  });

program.parse();
