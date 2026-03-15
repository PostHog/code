export const DEFAULT_MODEL = "opus";

const GATEWAY_TO_SDK_MODEL: Record<string, string> = {
  "claude-opus-4-5": "opus",
  "claude-opus-4-6": "opus",
  "claude-sonnet-4-5": "sonnet",
  "claude-sonnet-4-6": "sonnet",
  "claude-haiku-4-5": "haiku",
};

export function toSdkModelId(modelId: string): string {
  return GATEWAY_TO_SDK_MODEL[modelId] ?? modelId;
}

const MODELS_WITH_1M_CONTEXT = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
]);

export function supports1MContext(modelId: string): boolean {
  return MODELS_WITH_1M_CONTEXT.has(modelId);
}

export function getDefaultContextWindow(modelId: string): number {
  return supports1MContext(modelId) ? 1_000_000 : 200_000;
}
