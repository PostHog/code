import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import Ajv from "ajv";
import * as z from "zod";
import type { Logger } from "../../../utils/logger";
import { OUTPUT_SERVER_NAME, OUTPUT_TOOL_NAME } from "./constants";

export {
  OUTPUT_SERVER_NAME,
  OUTPUT_TOOL_FULL_NAME,
  OUTPUT_TOOL_NAME,
} from "./constants";

export interface CreateOutputServerOptions {
  jsonSchema: Record<string, unknown>;
  onOutput: (output: Record<string, unknown>) => Promise<void>;
  logger: Logger;
}

export function createOutputMcpServer(
  options: CreateOutputServerOptions,
): McpSdkServerConfigWithInstance {
  const { jsonSchema, onOutput, logger } = options;

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(jsonSchema);
  const zodType: z.ZodType = z.fromJSONSchema(jsonSchema); // Validate that the JSON schema can be converted to Zod schema, will throw if invalid
  if (!(zodType instanceof z.ZodObject)) {
    throw new Error(
      "Only JSON schemas that correspond to Zod objects are supported",
    );
  }
  const outputTool = tool(
    OUTPUT_TOOL_NAME,
    "Submit the structured output for this task. Call this tool with the required fields to deliver your final result. The output must conform to the task's JSON schema.",
    zodType.shape,
    async (args) => {
      const valid = validate(args);
      if (!valid) {
        const errors = validate.errors
          ?.map((e) => `${e.instancePath || "/"}: ${e.message}`)
          .join("; ");
        logger.warn("Structured output validation failed", { errors });
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

      try {
        await onOutput(args as Record<string, unknown>);
        logger.info("Structured output persisted successfully");
        return {
          content: [
            {
              type: "text" as const,
              text: "Output submitted successfully.",
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to persist structured output", { error: message });
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to submit output: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return createSdkMcpServer({
    name: OUTPUT_SERVER_NAME,
    tools: [outputTool],
  });
}
