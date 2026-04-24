/**
 * Standalone stdio MCP server for structured output in the Codex adapter.
 *
 * Spawned by codex-acp as an MCP server process. Reads the JSON schema
 * from the POSTHOG_OUTPUT_SCHEMA env var (base64-encoded), registers a
 * `create_output` tool, and validates input with AJV.
 *
 * Usage:
 *   POSTHOG_OUTPUT_SCHEMA=<base64> node structured-output-mcp-server.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Ajv from "ajv";
import { z } from "zod";

const OUTPUT_TOOL_NAME = "create_output";

const schemaEnv = process.env.POSTHOG_OUTPUT_SCHEMA;
if (!schemaEnv) {
  process.exit(1);
}

let jsonSchema: Record<string, unknown>;
try {
  jsonSchema = JSON.parse(Buffer.from(schemaEnv, "base64").toString("utf-8"));
} catch (_err) {
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(jsonSchema);

const zodType = z.fromJSONSchema(jsonSchema);
if (!(zodType instanceof z.ZodObject)) {
  process.exit(1);
}
// McpServer.tool() expects a mutable ZodRawShape
const zodShape = { ...zodType.shape } as z.ZodRawShape;

const server = new McpServer({
  name: "posthog_output",
  version: "1.0.0",
});

server.tool(
  OUTPUT_TOOL_NAME,
  "Submit the structured output for this task. Call this tool with the required fields to deliver your final result.",
  zodShape,
  async (args) => {
    const valid = validate(args);
    if (!valid) {
      const errors = validate.errors
        ?.map((e) => `${e.instancePath || "/"}: ${e.message}`)
        .join("; ");
      return {
        content: [
          {
            type: "text" as const,
            text: `Validation failed: ${errors}. Please fix the output and try again.`,
          },
        ],
        isError: true,
      };
    }

    // Output is valid — return success. The parent process captures
    // the validated output by intercepting the tool call in the ACP stream.
    return {
      content: [
        {
          type: "text" as const,
          text: "Output submitted successfully.",
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
