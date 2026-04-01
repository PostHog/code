import { z } from "zod";
import type { StoredLogEntry } from "./types/session-events";

// Execution mode schema and type - shared between main and renderer
export const executionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

// Effort level schema and type - shared between main and renderer
export const effortLevelSchema = z.enum(["low", "medium", "high", "max"]);
export type EffortLevel = z.infer<typeof effortLevelSchema>;

interface UserBasic {
  id: number;
  uuid: string;
  distinct_id?: string | null;
  first_name?: string;
  last_name?: string;
  email: string;
  is_email_verified?: boolean | null;
}

export interface Task {
  id: string;
  task_number: number | null;
  slug: string;
  title: string;
  title_manually_set?: boolean;
  description: string;
  created_at: string;
  updated_at: string;
  created_by?: UserBasic | null;
  origin_product: string;
  repository?: string | null; // Format: "organization/repository" (e.g., "posthog/posthog-js")
  github_integration?: number | null;
  json_schema?: Record<string, unknown> | null;
  latest_run?: TaskRun;
}

export interface TaskRun {
  id: string;
  task: string; // Task ID
  team: number;
  branch: string | null;
  stage?: string | null; // Current stage (e.g., 'research', 'plan', 'build')
  environment?: "local" | "cloud";
  status: "started" | "in_progress" | "completed" | "failed" | "cancelled";
  log_url: string;
  error_message: string | null;
  output: Record<string, unknown> | null; // Structured output (PR URL, commit SHA, etc.)
  state: Record<string, unknown>; // Intermediate run state (defaults to {}, never null)
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type NetworkAccessLevel = "trusted" | "full" | "custom";

export interface SandboxEnvironment {
  id: string;
  name: string;
  network_access_level: NetworkAccessLevel;
  allowed_domains: string[];
  include_default_domains: boolean;
  repositories: string[];
  has_environment_variables: boolean;
  private: boolean;
  effective_domains: string[];
  created_by?: UserBasic | null;
  created_at: string;
  updated_at: string;
}

export interface SandboxEnvironmentInput {
  name: string;
  network_access_level: NetworkAccessLevel;
  allowed_domains?: string[];
  include_default_domains?: boolean;
  repositories?: string[];
  environment_variables?: Record<string, string>;
  private?: boolean;
}

export type CloudTaskUpdateKind = "logs" | "status" | "snapshot";

export interface CloudTaskUpdatePayload {
  taskId: string;
  runId: string;
  kind: CloudTaskUpdateKind;
  // Log fields (present when kind is "logs" or "snapshot")
  newEntries?: StoredLogEntry[];
  totalEntryCount?: number;
  // Status fields (present when kind is "status" or "snapshot")
  status?: TaskRun["status"];
  stage?: string | null;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  branch?: string | null;
}

// Mention types for editors
type MentionType =
  | "file"
  | "error"
  | "experiment"
  | "insight"
  | "feature_flag"
  | "generic";

export interface MentionItem {
  // File items
  path?: string;
  name?: string;
  // URL items
  url?: string;
  type?: MentionType;
  label?: string;
  id?: string;
  urlId?: string;
}

// Git file status types
export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface ChangedFile {
  path: string;
  status: GitFileStatus;
  originalPath?: string; // For renames: the old path
  linesAdded?: number;
  linesRemoved?: number;
}

// External apps detection types
export type ExternalAppType = "editor" | "terminal" | "file-manager";

export interface DetectedApplication {
  id: string; // "vscode", "cursor", "iterm"
  name: string; // "Visual Studio Code"
  type: ExternalAppType;
  path: string; // "/Applications/Visual Studio Code.app"
  command: string; // Launch command
  icon?: string; // Base64 data URL
}

export type SignalReportStatus =
  | "potential"
  | "candidate"
  | "in_progress"
  | "ready"
  | "failed"
  | "pending_input"
  | "suppressed"
  | "deleted";

/** Actionability priority from the researched report (actionability judgment artefact). */
export type SignalReportPriority = "P0" | "P1" | "P2" | "P3" | "P4";

/**
 * One or more `SignalReportStatus` values joined by commas, e.g. `potential` or `potential,candidate,ready`.
 * This looks horrendous but it's superb, trust me bro.
 */
export type CommaSeparatedSignalReportStatuses =
  | SignalReportStatus
  | `${SignalReportStatus},${SignalReportStatus}`
  | `${SignalReportStatus},${SignalReportStatus},${SignalReportStatus}`
  | `${SignalReportStatus},${SignalReportStatus},${SignalReportStatus},${SignalReportStatus}`
  | `${SignalReportStatus},${SignalReportStatus},${SignalReportStatus},${SignalReportStatus},${SignalReportStatus}`;

export interface SignalReport {
  id: string;
  title: string | null;
  summary: string | null;
  status: SignalReportStatus;
  total_weight: number;
  signal_count: number;
  signals_at_run?: number;
  relevant_user_count: number | null;
  created_at: string;
  updated_at: string;
  artefact_count: number;
  /** P0–P4 from actionability judgment when the report is researched */
  priority?: SignalReportPriority | null;
  /** Whether the current user is a suggested reviewer for this report (server-annotated). */
  is_suggested_reviewer?: boolean;
}

export interface SignalReportArtefactContent {
  session_id: string;
  start_time: string;
  end_time: string;
  distinct_id: string;
  content: string;
  distance_to_centroid: number | null;
}

export interface SignalReportArtefact {
  id: string;
  type: string;
  content: SignalReportArtefactContent;
  created_at: string;
}

/** Artefact with `type: "signal_finding"` — per-signal research finding from the agentic report. */
export interface SignalFindingArtefact {
  id: string;
  type: "signal_finding";
  content: SignalFindingContent;
  created_at: string;
}

export interface SignalFindingContent {
  signal_id: string;
  relevant_code_paths: string[];
  relevant_commit_hashes: Record<string, string>;
  data_queried: string;
  verified: boolean;
}

/** Artefact with `type: "suggested_reviewers"` — content is an enriched reviewer list. */
export interface SuggestedReviewersArtefact {
  id: string;
  type: "suggested_reviewers";
  content: SuggestedReviewer[];
  created_at: string;
}

export interface SuggestedReviewerCommit {
  sha: string;
  url: string;
  reason: string;
}

export interface SuggestedReviewerUser {
  id: number;
  uuid: string;
  email: string;
  first_name: string;
}

export interface SuggestedReviewer {
  github_login: string;
  github_name: string | null;
  relevant_commits: SuggestedReviewerCommit[];
  user: SuggestedReviewerUser | null;
}

interface MatchedSignalMetadata {
  parent_signal_id: string;
  match_query: string;
  reason: string;
}

interface NoMatchSignalMetadata {
  reason: string;
  rejected_signal_ids: string[];
}

export type SignalMatchMetadata = MatchedSignalMetadata | NoMatchSignalMetadata;

export interface Signal {
  signal_id: string;
  content: string;
  source_product: string;
  source_type: string;
  source_id: string;
  weight: number;
  timestamp: string;
  extra: Record<string, unknown>;
  match_metadata?: SignalMatchMetadata | null;
}

export interface SignalReportsResponse {
  results: SignalReport[];
  count: number;
}

export interface SignalReportSignalsResponse {
  report: SignalReport | null;
  signals: Signal[];
}

export interface SignalReportArtefactsResponse {
  results: (
    | SignalReportArtefact
    | SignalFindingArtefact
    | SuggestedReviewersArtefact
  )[];
  count: number;
  unavailableReason?:
    | "forbidden"
    | "not_found"
    | "invalid_payload"
    | "request_failed";
}

export type SignalReportOrderingField =
  | "priority"
  | "signal_count"
  | "total_weight"
  | "created_at"
  | "updated_at";

export interface SignalReportsQueryParams {
  limit?: number;
  offset?: number;
  status?: CommaSeparatedSignalReportStatuses | string;
  /**
   * Comma-separated sort keys (prefix `-` for descending). `status` is semantic stage
   * rank (not lexicographic `status` column order). Also: `signal_count`, `total_weight`,
   * `created_at`, `updated_at`, `id`. Example: `status,-total_weight`.
   */
  ordering?: string;
}
