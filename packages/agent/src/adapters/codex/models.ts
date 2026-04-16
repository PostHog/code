interface ReasoningEffortOption {
  value: string;
  name: string;
}

const CODEX_REASONING_EFFORT_OPTIONS: ReasoningEffortOption[] = [
  { value: "low", name: "Low" },
  { value: "medium", name: "Medium" },
  { value: "high", name: "High" },
];

export function getReasoningEffortOptions(
  _modelId: string,
): ReasoningEffortOption[] {
  return CODEX_REASONING_EFFORT_OPTIONS;
}
