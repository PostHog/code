// ── Detection result types ──

export interface PostHogCall {
  method: string;
  key: string;
  line: number;
  keyStartCol: number;
  keyEndCol: number;
  /** True when the first argument is a non-literal expression (ternary, variable, etc.) */
  dynamic?: boolean;
}

export interface FunctionInfo {
  name: string;
  params: string[];
  isComponent: boolean;
  bodyLine: number;
  bodyIndent: string;
}

export interface VariantBranch {
  flagKey: string;
  variantKey: string;
  conditionLine: number;
  startLine: number;
  endLine: number;
}

export interface FlagAssignment {
  varName: string;
  method: string;
  flagKey: string;
  line: number;
  varNameEndCol: number;
  hasTypeAnnotation: boolean;
}

export interface PostHogInitCall {
  token: string;
  tokenLine: number;
  tokenStartCol: number;
  tokenEndCol: number;
  apiHost: string | null;
  configProperties: Map<string, string>;
}

export interface CompletionContext {
  type: "capture_event" | "flag_key" | "property_key" | "property_value";
  eventName?: string;
  propertyName?: string;
}

export interface Position {
  line: number;
  column: number;
}

// ── Detection configuration ──

export interface DetectionConfig {
  additionalClientNames: string[];
  additionalFlagFunctions: string[];
  detectNestedClients: boolean;
}

export const DEFAULT_CONFIG: DetectionConfig = {
  additionalClientNames: [],
  additionalFlagFunctions: [],
  detectNestedClients: true,
};

// ── Supported languages ──

export type SupportedLanguage =
  | "javascript"
  | "javascriptreact"
  | "typescript"
  | "typescriptreact"
  | "python"
  | "go"
  | "ruby";

// ── PostHog entity types (for flag classification / stale detection) ──

export interface FeatureFlag {
  id: number;
  key: string;
  name: string;
  active: boolean;
  filters: Record<string, unknown>;
  rollout_percentage: number | null;
  created_at: string;
  created_by: { email: string; first_name: string } | null;
  deleted: boolean;
}

export interface Experiment {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  feature_flag_key: string;
  created_at: string;
  created_by: { email: string; first_name: string } | null;
  metrics?: ExperimentMetric[];
  metrics_secondary?: ExperimentMetric[];
  parameters?: {
    feature_flag_variants?: { key: string; rollout_percentage: number }[];
    recommended_sample_size?: number;
  };
  conclusion?: "won" | "lost" | null;
  conclusion_comment?: string | null;
}

export interface ExperimentMetric {
  name: string;
  metric_type: "funnel" | "mean" | "ratio" | "retention";
  goal: "increase" | "decrease";
  uuid: string;
}

export interface EventDefinition {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  last_seen_at: string | null;
  verified: boolean;
  hidden: boolean;
}

// ── Stale flag types ──

export type StalenessReason =
  | "fully_rolled_out"
  | "inactive"
  | "not_in_posthog"
  | "experiment_complete";

export type FlagType = "boolean" | "multivariate" | "remote_config";
