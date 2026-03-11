import { getLlmGatewayUrl } from "@posthog/agent/posthog-api";
import { net } from "electron";
import { injectable } from "inversify";
import { logger } from "../../utils/logger.js";
import { getCurrentUserId, getPostHogClient } from "../posthog-analytics.js";
import type {
  AnthropicErrorResponse,
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  LlmCredentials,
  LlmMessage,
  PromptOutput,
} from "./schemas.js";

const log = logger.scope("llm-gateway");

export class LlmGatewayError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LlmGatewayError";
  }
}

@injectable()
export class LlmGatewayService {
  async prompt(
    credentials: LlmCredentials,
    messages: LlmMessage[],
    options: {
      system?: string;
      maxTokens?: number;
      model?: string;
    } = {},
  ): Promise<PromptOutput> {
    const { system, maxTokens, model = "claude-haiku-4-5" } = options;

    const gatewayUrl = getLlmGatewayUrl(credentials.apiHost);
    const messagesUrl = `${gatewayUrl}/v1/messages`;

    const requestBody: AnthropicMessagesRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    if (maxTokens !== undefined) {
      requestBody.max_tokens = maxTokens;
    }

    if (system) {
      requestBody.system = system;
    }

    log.debug("Sending request to LLM gateway", {
      url: messagesUrl,
      model,
      messageCount: messages.length,
    });

    const startTime = performance.now();

    const response = await net.fetch(messagesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorData: AnthropicErrorResponse | null = null;

      try {
        errorData = JSON.parse(errorBody) as AnthropicErrorResponse;
      } catch {
        log.error("Failed to parse error response", {
          errorBody,
          status: response.status,
        });
      }

      const errorMessage =
        errorData?.error?.message ||
        `HTTP ${response.status}: ${response.statusText}`;
      const errorType = errorData?.error?.type || "unknown_error";
      const errorCode = errorData?.error?.code;

      log.error("LLM gateway request failed", {
        status: response.status,
        errorType,
        errorMessage,
      });

      this.captureAiGeneration({
        model,
        input: requestBody.messages,
        system,
        latencySeconds: (performance.now() - startTime) / 1000,
        httpStatus: response.status,
        baseUrl: gatewayUrl,
        error: errorMessage,
      });

      throw new LlmGatewayError(
        errorMessage,
        errorType,
        errorCode,
        response.status,
      );
    }

    const data = (await response.json()) as AnthropicMessagesResponse;
    const latencySeconds = (performance.now() - startTime) / 1000;

    const textContent = data.content.find((c) => c.type === "text");
    const content = textContent?.text || "";

    log.debug("LLM gateway response received", {
      model: data.model,
      stopReason: data.stop_reason,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    });

    this.captureAiGeneration({
      model: data.model,
      input: requestBody.messages,
      system,
      outputContent: content,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      latencySeconds,
      httpStatus: response.status,
      baseUrl: gatewayUrl,
    });

    return {
      content,
      model: data.model,
      stopReason: data.stop_reason,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  private captureAiGeneration(params: {
    model: string;
    input: AnthropicMessagesRequest["messages"];
    system?: string;
    outputContent?: string;
    inputTokens?: number;
    outputTokens?: number;
    latencySeconds: number;
    httpStatus: number;
    baseUrl: string;
    error?: string;
  }): void {
    const client = getPostHogClient();
    if (!client) return;

    const distinctId = getCurrentUserId() || "anonymous-app-event";

    const aiInput = params.system
      ? [{ role: "system" as const, content: params.system }, ...params.input]
      : params.input;

    const properties: Record<string, unknown> = {
      $ai_provider: "anthropic",
      $ai_model: params.model,
      $ai_input: aiInput,
      $ai_latency: params.latencySeconds,
      $ai_http_status: params.httpStatus,
      $ai_base_url: params.baseUrl,
      $ai_input_tokens: params.inputTokens,
      $ai_output_tokens: params.outputTokens,
    };

    if (params.outputContent) {
      properties.$ai_output_choices = [
        { role: "assistant", content: params.outputContent },
      ];
    }

    if (params.error) {
      properties.$ai_is_error = true;
      properties.$ai_error = params.error;
    }

    client.capture({
      distinctId,
      event: "$ai_generation",
      properties,
    });
  }
}
