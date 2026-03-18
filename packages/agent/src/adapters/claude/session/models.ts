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

const MODELS_WITH_EFFORT = new Set([
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
]);

const MODELS_WITH_MAX_EFFORT = new Set(["claude-opus-4-6"]);

export function supportsEffort(modelId: string): boolean {
  return MODELS_WITH_EFFORT.has(modelId);
}

export function supportsMaxEffort(modelId: string): boolean {
  return MODELS_WITH_MAX_EFFORT.has(modelId);
}

interface EffortOption {
  value: string;
  name: string;
}

export function getEffortOptions(modelId: string): EffortOption[] | null {
  if (!supportsEffort(modelId)) return null;

  const options: EffortOption[] = [
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
    { value: "high", name: "High" },
  ];

  if (supportsMaxEffort(modelId)) {
    options.push({ value: "max", name: "Max" });
  }

  return options;
}
