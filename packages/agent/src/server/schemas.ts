import { z } from "zod/v4";

const httpHeaderSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const remoteMcpServerSchema = z.object({
  type: z.enum(["http", "sse"]),
  name: z.string().min(1, "MCP server name is required"),
  url: z.url({ error: "MCP server url must be a valid URL" }),
  headers: z.array(httpHeaderSchema).default([]),
});

export const mcpServersSchema = z.array(remoteMcpServerSchema);

export type RemoteMcpServer = z.infer<typeof remoteMcpServerSchema>;

export const claudeCodeConfigSchema = z.object({
  systemPrompt: z
    .union([
      z.string(),
      z.object({
        type: z.literal("preset"),
        preset: z.literal("claude_code"),
        append: z.string().optional(),
      }),
    ])
    .optional(),
  plugins: z
    .array(z.object({ type: z.literal("local"), path: z.string() }))
    .optional(),
});

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export const userMessageParamsSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

export const commandParamsSchemas = {
  user_message: userMessageParamsSchema,
  "posthog/user_message": userMessageParamsSchema,
  cancel: z.object({}).optional(),
  "posthog/cancel": z.object({}).optional(),
  close: z.object({}).optional(),
  "posthog/close": z.object({}).optional(),
} as const;

export type CommandMethod = keyof typeof commandParamsSchemas;

export function validateCommandParams(
  method: string,
  params: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema =
    commandParamsSchemas[method as CommandMethod] ??
    commandParamsSchemas[
      method.replace("posthog/", "") as keyof typeof commandParamsSchemas
    ];

  if (!schema) {
    return { success: false, error: `Unknown method: ${method}` };
  }

  const result = schema.safeParse(params);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}
