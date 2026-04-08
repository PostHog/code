export { PostHogDetector } from "./detector.js";

export {
  classifyFlagType,
  extractConditionCount,
  extractRollout,
  extractVariants,
  isFullyRolledOut,
} from "./flag-classification.js";
export type { LangFamily, QueryStrings } from "./languages.js";
export { ALL_FLAG_METHODS, CLIENT_NAMES, LANG_FAMILIES } from "./languages.js";
export type { StalenessCheckOptions } from "./stale-flags.js";
export {
  classifyStaleness,
  STALENESS_ORDER,
} from "./stale-flags.js";

export type {
  CompletionContext,
  DetectionConfig,
  EventDefinition,
  Experiment,
  ExperimentMetric,
  FeatureFlag,
  FlagAssignment,
  FlagType,
  FunctionInfo,
  Position,
  PostHogCall,
  PostHogInitCall,
  StalenessReason,
  SupportedLanguage,
  VariantBranch,
} from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
