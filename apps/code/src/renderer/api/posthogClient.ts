import type {
  ActionabilityJudgmentArtefact,
  AvailableSuggestedReviewer,
  AvailableSuggestedReviewersResponse,
  PriorityJudgmentArtefact,
  SandboxEnvironment,
  SandboxEnvironmentInput,
  SignalFindingArtefact,
  SignalProcessingStateResponse,
  SignalReport,
  SignalReportArtefact,
  SignalReportArtefactsResponse,
  SignalReportSignalsResponse,
  SignalReportStatus,
  SignalReportsQueryParams,
  SignalReportsResponse,
  SuggestedReviewersArtefact,
  Task,
  TaskRun,
} from "@shared/types";
import type { CloudRunSource, PrAuthorshipMode } from "@shared/types/cloud";
import type { StoredLogEntry } from "@shared/types/session-events";
import { logger } from "@utils/logger";
import { buildApiFetcher } from "./fetcher";
import { createApiClient, type Schemas } from "./generated";

const log = logger.scope("posthog-client");

export type McpRecommendedServer = Schemas.RecommendedServer;

export type McpServerInstallation = Schemas.MCPServerInstallation;

export type Evaluation = Schemas.Evaluation;

export interface SignalSourceConfig {
  id: string;
  source_product:
    | "session_replay"
    | "llm_analytics"
    | "github"
    | "linear"
    | "zendesk"
    | "error_tracking";
  source_type:
    | "session_analysis_cluster"
    | "evaluation"
    | "issue"
    | "ticket"
    | "issue_created"
    | "issue_reopened"
    | "issue_spiking";
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExternalDataSourceSchema {
  id: string;
  name: string;
  should_sync: boolean;
  /** e.g. `full_refresh` (full table replication), `incremental`, `append` */
  sync_type?: string | null;
}

export interface ExternalDataSource {
  id: string;
  source_type: string;
  status: string;
  // The generated `ExternalDataSourceSerializers` types this as `string`,
  // but the actual API returns an array of schema objects
  schemas?: ExternalDataSourceSchema[] | string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

type AnyArtefact =
  | SignalReportArtefact
  | PriorityJudgmentArtefact
  | ActionabilityJudgmentArtefact
  | SignalFindingArtefact
  | SuggestedReviewersArtefact;

const PRIORITY_VALUES = new Set(["P0", "P1", "P2", "P3", "P4"]);

function normalizePriorityJudgmentArtefact(
  value: Record<string, unknown>,
): PriorityJudgmentArtefact | null {
  const id = optionalString(value.id);
  if (!id) return null;

  const contentValue = isObjectRecord(value.content) ? value.content : null;
  if (!contentValue) return null;

  const priority = optionalString(contentValue.priority);
  if (!priority || !PRIORITY_VALUES.has(priority)) return null;

  return {
    id,
    type: "priority_judgment",
    created_at: optionalString(value.created_at) ?? new Date(0).toISOString(),
    content: {
      explanation: optionalString(contentValue.explanation) ?? "",
      priority: priority as PriorityJudgmentArtefact["content"]["priority"],
    },
  };
}

const ACTIONABILITY_VALUES = new Set([
  "immediately_actionable",
  "requires_human_input",
  "not_actionable",
]);

function normalizeActionabilityJudgmentArtefact(
  value: Record<string, unknown>,
): ActionabilityJudgmentArtefact | null {
  const id = optionalString(value.id);
  if (!id) return null;

  const contentValue = isObjectRecord(value.content) ? value.content : null;
  if (!contentValue) return null;

  // Support both agentic ("actionability") and legacy ("choice") field names
  const actionability =
    optionalString(contentValue.actionability) ??
    optionalString(contentValue.choice);
  if (!actionability || !ACTIONABILITY_VALUES.has(actionability)) return null;

  return {
    id,
    type: "actionability_judgment",
    created_at: optionalString(value.created_at) ?? new Date(0).toISOString(),
    content: {
      explanation: optionalString(contentValue.explanation) ?? "",
      actionability:
        actionability as ActionabilityJudgmentArtefact["content"]["actionability"],
      already_addressed:
        typeof contentValue.already_addressed === "boolean"
          ? contentValue.already_addressed
          : false,
    },
  };
}

function normalizeSignalFindingArtefact(
  value: Record<string, unknown>,
): SignalFindingArtefact | null {
  const id = optionalString(value.id);
  if (!id) return null;

  const contentValue = isObjectRecord(value.content) ? value.content : null;
  if (!contentValue) return null;

  const signalId = optionalString(contentValue.signal_id);
  if (!signalId) return null;

  return {
    id,
    type: "signal_finding",
    created_at: optionalString(value.created_at) ?? new Date(0).toISOString(),
    content: {
      signal_id: signalId,
      relevant_code_paths: Array.isArray(contentValue.relevant_code_paths)
        ? contentValue.relevant_code_paths.filter(
            (p: unknown): p is string => typeof p === "string",
          )
        : [],
      relevant_commit_hashes: isObjectRecord(
        contentValue.relevant_commit_hashes,
      )
        ? Object.fromEntries(
            Object.entries(contentValue.relevant_commit_hashes).filter(
              (e): e is [string, string] => typeof e[1] === "string",
            ),
          )
        : {},
      data_queried: optionalString(contentValue.data_queried) ?? "",
      verified:
        typeof contentValue.verified === "boolean"
          ? contentValue.verified
          : false,
    },
  };
}

function normalizeSignalReportArtefact(value: unknown): AnyArtefact | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const dispatchType = optionalString(value.type);
  if (dispatchType === "signal_finding") {
    return normalizeSignalFindingArtefact(value);
  }
  if (dispatchType === "actionability_judgment") {
    return normalizeActionabilityJudgmentArtefact(value);
  }
  if (dispatchType === "priority_judgment") {
    return normalizePriorityJudgmentArtefact(value);
  }

  const id = optionalString(value.id);
  if (!id) {
    return null;
  }

  const type = dispatchType ?? "unknown";
  const created_at =
    optionalString(value.created_at) ?? new Date(0).toISOString();

  // suggested_reviewers: content is an array of reviewer objects
  if (type === "suggested_reviewers" && Array.isArray(value.content)) {
    return {
      id,
      type: "suggested_reviewers" as const,
      created_at,
      content: value.content as SuggestedReviewersArtefact["content"],
    };
  }

  // video_segment and other artefacts with object content
  const contentValue = isObjectRecord(value.content) ? value.content : null;
  if (!contentValue) {
    return null;
  }

  const content = optionalString(contentValue.content);
  const sessionId = optionalString(contentValue.session_id);

  // The backend may return empty content objects when binary decode fails.
  if (!content && !sessionId) {
    return null;
  }

  return {
    id,
    type,
    created_at,
    content: {
      session_id: sessionId ?? "",
      start_time: optionalString(contentValue.start_time) ?? "",
      end_time: optionalString(contentValue.end_time) ?? "",
      distinct_id: optionalString(contentValue.distinct_id) ?? "",
      content: content ?? "",
      distance_to_centroid:
        typeof contentValue.distance_to_centroid === "number"
          ? contentValue.distance_to_centroid
          : null,
    },
  };
}

function parseSignalReportArtefactsPayload(
  value: unknown,
): SignalReportArtefactsResponse {
  const payload = isObjectRecord(value) ? value : null;
  const rawResults = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(value)
      ? value
      : [];

  const results = rawResults
    .map(normalizeSignalReportArtefact)
    .filter((artefact): artefact is AnyArtefact => artefact !== null);
  const count =
    typeof payload?.count === "number" ? payload.count : results.length;

  if (rawResults.length > 0 && results.length === 0) {
    return {
      results: [],
      count: 0,
      unavailableReason: "invalid_payload",
    };
  }

  return {
    results,
    count,
  };
}

function normalizeAvailableSuggestedReviewer(
  uuid: string,
  value: unknown,
): AvailableSuggestedReviewer | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const normalizedUuid = optionalString(uuid);
  if (!normalizedUuid) {
    return null;
  }

  return {
    uuid: normalizedUuid,
    name: optionalString(value.name) ?? "",
    email: optionalString(value.email) ?? "",
  };
}

function parseAvailableSuggestedReviewersPayload(
  value: unknown,
): AvailableSuggestedReviewersResponse {
  if (!isObjectRecord(value)) {
    return {
      results: [],
      count: 0,
    };
  }

  const results = Object.entries(value)
    .map(([uuid, reviewer]) =>
      normalizeAvailableSuggestedReviewer(uuid, reviewer),
    )
    .filter(
      (reviewer): reviewer is AvailableSuggestedReviewer => reviewer !== null,
    );

  return {
    results,
    count: results.length,
  };
}

export class PostHogAPIClient {
  private api: ReturnType<typeof createApiClient>;
  private _teamId: number | null = null;

  constructor(
    apiHost: string,
    getAccessToken: () => Promise<string>,
    refreshAccessToken: () => Promise<string>,
    teamId?: number,
  ) {
    const baseUrl = apiHost.endsWith("/") ? apiHost.slice(0, -1) : apiHost;
    this.api = createApiClient(
      buildApiFetcher({
        getAccessToken,
        refreshAccessToken,
      }),
      baseUrl,
    );
    if (teamId) {
      this._teamId = teamId;
    }
  }

  setTeamId(teamId: number): void {
    this._teamId = teamId;
  }

  private async getTeamId(): Promise<number> {
    if (this._teamId !== null) {
      return this._teamId;
    }

    const user = await this.api.get("/api/users/{uuid}/", {
      path: { uuid: "@me" },
    });

    if (user?.team?.id) {
      this._teamId = user.team.id;
      return this._teamId;
    }

    throw new Error("No team found for user");
  }

  async getCurrentUser() {
    const data = await this.api.get("/api/users/{uuid}/", {
      path: { uuid: "@me" },
    });
    return data;
  }

  async getGithubLogin(): Promise<string | null> {
    // @ts-expect-error this is not in the generated client YET
    const data = (await this.api.get("/api/users/{uuid}/github_login/", {
      path: { uuid: "@me" },
    })) as { github_login: string | null };
    return data.github_login;
  }

  async switchOrganization(orgId: string): Promise<void> {
    await this.api.patch("/api/users/{uuid}/", {
      path: { uuid: "@me" },
      body: { set_current_organization: orgId } as Record<string, unknown>,
    });
  }

  async getProject(projectId: number) {
    //@ts-expect-error this is not in the generated client
    const data = await this.api.get("/api/projects/{project_id}/", {
      path: { project_id: projectId.toString() },
    });
    return data as Schemas.Team;
  }

  async listSignalSourceConfigs(
    projectId: number,
  ): Promise<SignalSourceConfig[]> {
    const urlPath = `/api/projects/${projectId}/signal_source_configs/`;
    const url = new URL(`${this.api.baseUrl}${urlPath}`);
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: urlPath,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch signal source configs: ${response.statusText}`,
      );
    }
    const data = (await response.json()) as
      | { results: SignalSourceConfig[] }
      | SignalSourceConfig[];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async createSignalSourceConfig(
    projectId: number,
    options: {
      source_product: SignalSourceConfig["source_product"];
      source_type: SignalSourceConfig["source_type"];
      enabled: boolean;
      config?: Record<string, unknown>;
    },
  ): Promise<SignalSourceConfig> {
    const urlPath = `/api/projects/${projectId}/signal_source_configs/`;
    const url = new URL(`${this.api.baseUrl}${urlPath}`);
    const response = await this.api.fetcher.fetch({
      method: "post",
      url,
      path: urlPath,
      overrides: {
        body: JSON.stringify(options),
      },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw new Error(
        errorData.detail ??
          `Failed to create signal source config: ${response.statusText}`,
      );
    }
    return (await response.json()) as SignalSourceConfig;
  }

  async updateSignalSourceConfig(
    projectId: number,
    configId: string,
    updates: { enabled: boolean },
  ): Promise<SignalSourceConfig> {
    const urlPath = `/api/projects/${projectId}/signal_source_configs/${configId}/`;
    const url = new URL(`${this.api.baseUrl}${urlPath}`);
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: urlPath,
      overrides: {
        body: JSON.stringify(updates),
      },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw new Error(
        errorData.detail ??
          `Failed to update signal source config: ${response.statusText}`,
      );
    }
    return (await response.json()) as SignalSourceConfig;
  }

  async listEvaluations(projectId: number): Promise<Evaluation[]> {
    const data = await this.api.get(
      "/api/environments/{project_id}/evaluations/",
      {
        path: { project_id: projectId.toString() },
        query: { limit: 200 },
      },
    );
    return data.results ?? [];
  }

  async updateEvaluation(
    projectId: number,
    evaluationId: string,
    updates: { enabled: boolean },
  ): Promise<Evaluation> {
    return await this.api.patch(
      "/api/environments/{project_id}/evaluations/{id}/",
      {
        path: {
          project_id: projectId.toString(),
          id: evaluationId,
        },
        body: updates,
      },
    );
  }

  async listExternalDataSources(
    projectId: number,
  ): Promise<ExternalDataSource[]> {
    const data = (await this.api.get(
      "/api/projects/{project_id}/external_data_sources/",
      {
        path: { project_id: projectId.toString() },
        query: {},
      },
    )) as unknown as { results?: ExternalDataSource[] } | ExternalDataSource[];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async createExternalDataSource(
    projectId: number,
    payload: {
      source_type: string;
      payload: Record<string, unknown>;
    },
  ): Promise<ExternalDataSource> {
    const response = await this.api.post(
      "/api/projects/{project_id}/external_data_sources/",
      {
        path: { project_id: projectId.toString() },
        body: payload as unknown as Schemas.ExternalDataSourceSerializers,
        withResponse: true,
        throwOnStatusError: false,
      },
    );
    if (!response.ok) {
      const errorData = isObjectRecord(response.data)
        ? (response.data as { detail?: string })
        : {};
      throw new Error(
        errorData.detail ??
          `Failed to create external data source: ${response.statusText}`,
      );
    }
    return response.data as unknown as ExternalDataSource;
  }

  async updateExternalDataSchema(
    projectId: number,
    schemaId: string,
    updates: { should_sync: boolean; sync_type?: string },
  ): Promise<void> {
    const urlPath = `/api/projects/${projectId}/external_data_schemas/${schemaId}/`;
    const url = new URL(`${this.api.baseUrl}${urlPath}`);
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: urlPath,
      overrides: {
        body: JSON.stringify(updates),
      },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw new Error(
        errorData.detail ??
          `Failed to update external data schema: ${response.statusText}`,
      );
    }
  }

  async getTasks(options?: {
    repository?: string;
    createdBy?: number;
    originProduct?: string;
  }) {
    const teamId = await this.getTeamId();
    const params: Record<string, string | number> = {
      limit: 500,
    };

    if (options?.repository) {
      params.repository = options.repository;
    }

    if (options?.createdBy) {
      params.created_by = options.createdBy;
    }

    if (options?.originProduct) {
      params.origin_product = options.originProduct;
    }

    const data = await this.api.get(`/api/projects/{project_id}/tasks/`, {
      path: { project_id: teamId.toString() },
      query: params,
    });

    return data.results ?? [];
  }

  async getTask(taskId: string) {
    const teamId = await this.getTeamId();
    const data = await this.api.get(`/api/projects/{project_id}/tasks/{id}/`, {
      path: { project_id: teamId.toString(), id: taskId },
    });
    return data as unknown as Task;
  }

  async createTask(
    options: Pick<Task, "description"> &
      Partial<
        Pick<
          Task,
          | "title"
          | "repository"
          | "json_schema"
          | "origin_product"
          | "signal_report"
        >
      > & {
        github_integration?: number | null;
      },
  ) {
    const teamId = await this.getTeamId();

    const data = await this.api.post(`/api/projects/{project_id}/tasks/`, {
      path: { project_id: teamId.toString() },
      body: {
        origin_product: "user_created",
        ...options,
      } as unknown as Schemas.Task,
    });

    return data;
  }

  async updateTask(taskId: string, updates: Partial<Schemas.Task>) {
    const teamId = await this.getTeamId();
    const data = await this.api.patch(
      `/api/projects/{project_id}/tasks/{id}/`,
      {
        path: { project_id: teamId.toString(), id: taskId },
        body: updates,
      },
    );

    return data;
  }

  async deleteTask(taskId: string) {
    const teamId = await this.getTeamId();
    await this.api.delete(`/api/projects/{project_id}/tasks/{id}/`, {
      path: { project_id: teamId.toString(), id: taskId },
    });
  }

  async duplicateTask(taskId: string) {
    const task = await this.getTask(taskId);
    return this.createTask({
      description: task.description ?? "",
      title: task.title,
      repository: task.repository,
      json_schema: task.json_schema,
      origin_product: task.origin_product,
      github_integration: task.github_integration,
    });
  }

  async sendRunCommand(
    taskId: string,
    runId: string,
    method: "user_message" | "cancel" | "close",
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/command/`,
    );
    const body = {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
      id: `posthog-code-${Date.now()}`,
    };

    try {
      const response = await this.api.fetcher.fetch({
        method: "post",
        url,
        path: `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/command/`,
        overrides: {
          body: JSON.stringify(body),
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorMessage = `Command failed: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage =
            errorJson.error?.message ?? errorJson.error ?? errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      if (data.error) {
        return {
          success: false,
          error: data.error.message ?? JSON.stringify(data.error),
        };
      }

      return { success: true, result: data.result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async runTaskInCloud(
    taskId: string,
    branch?: string | null,
    options?: {
      resumeFromRunId?: string;
      pendingUserMessage?: string;
      sandboxEnvironmentId?: string;
      prAuthorshipMode?: PrAuthorshipMode;
      runSource?: CloudRunSource;
      signalReportId?: string;
      githubUserToken?: string;
    },
  ): Promise<Task> {
    const teamId = await this.getTeamId();
    const body: Record<string, unknown> = { mode: "interactive" };
    if (branch) {
      body.branch = branch;
    }
    if (options?.resumeFromRunId) {
      body.resume_from_run_id = options.resumeFromRunId;
    }
    if (options?.pendingUserMessage) {
      body.pending_user_message = options.pendingUserMessage;
    }
    if (options?.sandboxEnvironmentId) {
      body.sandbox_environment_id = options.sandboxEnvironmentId;
    }
    if (options?.prAuthorshipMode) {
      body.pr_authorship_mode = options.prAuthorshipMode;
    }
    if (options?.runSource) {
      body.run_source = options.runSource;
    }
    if (options?.signalReportId) {
      body.signal_report_id = options.signalReportId;
    }
    if (options?.githubUserToken) {
      body.github_user_token = options.githubUserToken;
    }

    const data = await this.api.post(
      `/api/projects/{project_id}/tasks/{id}/run/`,
      {
        path: { project_id: teamId.toString(), id: taskId },
        body,
      },
    );

    return data as unknown as Task;
  }

  async listTaskRuns(taskId: string): Promise<TaskRun[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/tasks/${taskId}/runs/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task runs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getTaskRun(taskId: string, runId: string): Promise<TaskRun> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task run: ${response.statusText}`);
    }

    return await response.json();
  }

  async createTaskRun(taskId: string): Promise<TaskRun> {
    const teamId = await this.getTeamId();
    const data = await this.api.post(
      `/api/projects/{project_id}/tasks/{task_id}/runs/`,
      {
        path: { project_id: teamId.toString(), task_id: taskId },
        //@ts-expect-error the generated client does not infer the request type unless explicitly specified on the viewset
        body: {
          environment: "local" as const,
        },
      },
    );
    return data as unknown as TaskRun;
  }

  async updateTaskRun(
    taskId: string,
    runId: string,
    updates: Partial<
      Pick<
        TaskRun,
        "status" | "branch" | "stage" | "error_message" | "output" | "state"
      >
    >,
  ): Promise<TaskRun> {
    const teamId = await this.getTeamId();
    const data = await this.api.patch(
      `/api/projects/{project_id}/tasks/{task_id}/runs/{id}/`,
      {
        path: {
          project_id: teamId.toString(),
          task_id: taskId,
          id: runId,
        },
        body: updates as Record<string, unknown>,
      },
    );
    return data as unknown as TaskRun;
  }

  /**
   * Append events to a task run's S3 log file
   */
  async appendTaskRunLog(
    taskId: string,
    runId: string,
    entries: StoredLogEntry[],
  ): Promise<void> {
    const teamId = await this.getTeamId();
    const url = `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/append_log/`;
    const response = await this.api.fetcher.fetch({
      method: "post",
      url: new URL(url),
      path: url,
      overrides: {
        body: JSON.stringify({ entries }),
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to append log: ${response.statusText}`);
    }
  }

  async getTaskRunSessionLogs(
    taskId: string,
    runId: string,
    options?: { limit?: number; after?: string },
  ): Promise<StoredLogEntry[]> {
    try {
      const teamId = await this.getTeamId();
      const url = new URL(
        `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/session_logs/`,
      );
      url.searchParams.set("limit", String(options?.limit ?? 5000));
      if (options?.after) {
        url.searchParams.set("after", options.after);
      }
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/session_logs/`,
      });

      if (!response.ok) {
        log.warn(
          `Failed to fetch session logs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      return (await response.json()) as StoredLogEntry[];
    } catch (err) {
      log.warn("Failed to fetch task run session logs", err);
      return [];
    }
  }

  async getTaskLogs(taskId: string): Promise<StoredLogEntry[]> {
    try {
      const task = (await this.getTask(taskId)) as unknown as Task;
      const logUrl = task?.latest_run?.log_url;

      if (!logUrl) {
        return [];
      }

      const response = await fetch(logUrl);

      if (!response.ok) {
        log.warn(
          `Failed to fetch logs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const content = await response.text();

      if (!content.trim()) {
        return [];
      }
      return content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as StoredLogEntry);
    } catch (err) {
      log.warn("Failed to fetch task logs from latest run", err);
      return [];
    }
  }

  async getIntegrations() {
    const teamId = await this.getTeamId();
    return this.getIntegrationsForProject(teamId);
  }

  async getIntegrationsForProject(projectId: number) {
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${projectId}/integrations/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${projectId}/integrations/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch integrations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getGithubBranches(
    integrationId: string | number,
    repo: string,
  ): Promise<{ branches: string[]; defaultBranch: string | null }> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/integrations/${integrationId}/github_branches/`,
    );
    url.searchParams.set("repo", repo);
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/integrations/${integrationId}/github_branches/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitHub branches: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      branches: data.branches ?? data.results ?? data ?? [],
      defaultBranch: data.default_branch ?? null,
    };
  }

  async getGithubRepositories(
    integrationId: string | number,
  ): Promise<string[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/integrations/${integrationId}/github_repos/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/integrations/${integrationId}/github_repos/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitHub repositories: ${response.statusText}`,
      );
    }

    const data = await response.json();

    const repos = data.repositories ?? data.results ?? data ?? [];
    return repos.map((repo: string | { full_name?: string; name?: string }) => {
      if (typeof repo === "string") return repo;
      return (repo.full_name ?? repo.name ?? "").toLowerCase();
    });
  }

  async getAgents() {
    const teamId = await this.getTeamId();
    const url = new URL(`${this.api.baseUrl}/api/projects/${teamId}/agents/`);
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/agents/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getUsers() {
    const data = await this.api.get("/api/users/", {
      query: { limit: 1000 },
    });
    return data.results ?? [];
  }

  async updateTeam(updates: {
    session_recording_opt_in?: boolean;
    autocapture_exceptions_opt_in?: boolean;
  }): Promise<Schemas.Team> {
    const teamId = await this.getTeamId();
    const url = new URL(`${this.api.baseUrl}/api/projects/${teamId}/`);
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: `/api/projects/${teamId}/`,
      overrides: {
        body: JSON.stringify(updates),
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      let detail = responseText;
      try {
        const parsed = JSON.parse(responseText) as
          | { detail?: string }
          | Record<string, unknown>;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "detail" in parsed &&
          typeof parsed.detail === "string"
        ) {
          detail = parsed.detail;
        } else if (typeof parsed === "object" && parsed !== null) {
          detail = Object.entries(parsed)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join(", ");
        }
      } catch {
        // keep plain text fallback
      }

      throw new Error(
        `Failed to update team: ${detail || response.statusText}`,
      );
    }

    return await response.json();
  }

  /**
   * Get billing information for a specific organization.
   */
  async getOrgBilling(orgId: string): Promise<{
    has_active_subscription: boolean;
    customer_id: string | null;
  }> {
    const url = new URL(
      `${this.api.baseUrl}/api/organizations/${orgId}/billing/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/organizations/${orgId}/billing/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch organization billing: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      has_active_subscription:
        typeof data.has_active_subscription === "boolean"
          ? data.has_active_subscription
          : false,
      customer_id:
        typeof data.customer_id === "string" ? data.customer_id : null,
    };
  }

  async getSignalReports(
    params?: SignalReportsQueryParams,
  ): Promise<SignalReportsResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/`,
    );

    if (params?.limit != null) {
      url.searchParams.set("limit", String(params.limit));
    }
    if (params?.offset != null) {
      url.searchParams.set("offset", String(params.offset));
    }
    if (params?.status) {
      url.searchParams.set("status", params.status);
    }
    if (params?.ordering) {
      url.searchParams.set("ordering", params.ordering);
    }
    if (params?.source_product) {
      url.searchParams.set("source_product", params.source_product);
    }
    if (params?.suggested_reviewers) {
      url.searchParams.set("suggested_reviewers", params.suggested_reviewers);
    }

    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/signal_reports/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch signal reports: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      results: data.results ?? data ?? [],
      count: data.count ?? data.results?.length ?? data?.length ?? 0,
    };
  }

  async getSignalProcessingState(): Promise<SignalProcessingStateResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_processing/`,
    );
    const path = `/api/projects/${teamId}/signal_processing/`;

    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch signal processing state: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      paused_until:
        typeof data?.paused_until === "string" ? data.paused_until : null,
    };
  }

  async getAvailableSuggestedReviewers(
    query?: string,
  ): Promise<AvailableSuggestedReviewersResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/available_reviewers/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/available_reviewers/`;

    if (query?.trim()) {
      url.searchParams.set("query", query.trim());
    }

    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch available suggested reviewers: ${response.statusText}`,
      );
    }

    return parseAvailableSuggestedReviewersPayload(await response.json());
  }

  async getSignalReportSignals(
    reportId: string,
  ): Promise<SignalReportSignalsResponse> {
    try {
      const teamId = await this.getTeamId();
      const url = new URL(
        `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/signals/`,
      );
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: `/api/projects/${teamId}/signal_reports/${reportId}/signals/`,
      });

      if (!response.ok) {
        log.warn("Signal report signals unavailable", {
          reportId,
          status: response.status,
        });
        return { report: null, signals: [] };
      }

      const data = await response.json();
      return {
        report: data.report ?? null,
        signals: data.signals ?? [],
      };
    } catch (error) {
      log.warn("Failed to fetch signal report signals", { reportId, error });
      return { report: null, signals: [] };
    }
  }

  async getSignalReportArtefacts(
    reportId: string,
  ): Promise<SignalReportArtefactsResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/artefacts/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/${reportId}/artefacts/`;

    try {
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path,
      });

      if (!response.ok) {
        const responseText = await response.text();
        const unavailableReason =
          response.status === 403
            ? "forbidden"
            : response.status === 404
              ? "not_found"
              : "request_failed";

        log.warn("Signal report artefacts unavailable", {
          teamId,
          reportId,
          status: response.status,
          statusText: response.statusText,
          body: responseText || undefined,
        });

        return { results: [], count: 0, unavailableReason };
      }

      const data = (await response.json()) as unknown;
      const parsed = parseSignalReportArtefactsPayload(data);

      if (parsed.unavailableReason) {
        log.warn("Signal report artefacts payload did not match schema", {
          teamId,
          reportId,
        });
      }

      return parsed;
    } catch (error) {
      log.warn("Failed to fetch signal report artefacts", {
        teamId,
        reportId,
        error,
      });
      return {
        results: [],
        count: 0,
        unavailableReason: "request_failed",
      };
    }
  }

  async updateSignalReportState(
    reportId: string,
    input: {
      state: Extract<SignalReportStatus, "suppressed" | "potential">;
      snooze_for?: number;
      reset_weight?: boolean;
      error?: string;
    },
  ): Promise<SignalReport> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/state/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/${reportId}/state/`;

    const response = await this.api.fetcher.fetch({
      method: "post",
      url,
      path,
      overrides: {
        body: JSON.stringify(input),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to update signal report state");
    }

    return (await response.json()) as SignalReport;
  }

  async deleteSignalReport(reportId: string): Promise<{
    status: "deletion_started" | "already_running";
    report_id: string;
  }> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/${reportId}/`;

    const response = await this.api.fetcher.fetch({
      method: "delete",
      url,
      path,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to delete signal report");
    }

    return (await response.json()) as {
      status: "deletion_started" | "already_running";
      report_id: string;
    };
  }

  async reingestSignalReport(reportId: string): Promise<{
    status: "reingestion_started" | "already_running";
    report_id: string;
  }> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/reingest/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/${reportId}/reingest/`;

    const response = await this.api.fetcher.fetch({
      method: "post",
      url,
      path,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to reingest signal report");
    }

    return (await response.json()) as {
      status: "reingestion_started" | "already_running";
      report_id: string;
    };
  }

  async getMcpServers(): Promise<McpRecommendedServer[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/mcp_servers/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/mcp_servers/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch MCP servers: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getMcpServerInstallations(): Promise<McpServerInstallation[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/mcp_server_installations/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/mcp_server_installations/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch MCP server installations: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async installCustomMcpServer(options: {
    name: string;
    url: string;
    auth_type: "none" | "api_key" | "oauth";
    api_key?: string;
    description?: string;
    install_source?: "posthog" | "posthog-code";
    posthog_code_callback_url?: string;
  }): Promise<McpServerInstallation | Schemas.OAuthRedirectResponse> {
    const teamId = await this.getTeamId();
    const apiUrl = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/mcp_server_installations/install_custom/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "post",
      url: apiUrl,
      path: `/api/environments/${teamId}/mcp_server_installations/install_custom/`,
      overrides: {
        body: JSON.stringify(options),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail ??
          `Failed to install MCP server: ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async updateMcpServerInstallation(
    installationId: string,
    updates: {
      display_name?: string;
      description?: string;
      is_enabled?: boolean;
    },
  ): Promise<McpServerInstallation> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/mcp_server_installations/${installationId}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: `/api/environments/${teamId}/mcp_server_installations/${installationId}/`,
      overrides: {
        body: JSON.stringify(updates),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail ??
          `Failed to update MCP server: ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async uninstallMcpServer(installationId: string): Promise<void> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/mcp_server_installations/${installationId}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "delete",
      url,
      path: `/api/environments/${teamId}/mcp_server_installations/${installationId}/`,
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to uninstall MCP server: ${response.statusText}`);
    }
  }

  /**
   * Check if a feature flag is enabled for the current project.
   * Returns true if the flag exists and is active, false otherwise.
   */
  async isFeatureFlagEnabled(flagKey: string): Promise<boolean> {
    try {
      const teamId = await this.getTeamId();
      const url = new URL(
        `${this.api.baseUrl}/api/projects/${teamId}/feature_flags/`,
      );
      url.searchParams.set("key", flagKey);

      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: `/api/projects/${teamId}/feature_flags/`,
      });

      if (!response.ok) {
        log.warn(`Failed to fetch feature flags: ${response.statusText}`);
        return false;
      }

      const data = await response.json();
      const flags = data.results ?? data ?? [];
      const flag = flags.find(
        (f: { key: string; active: boolean }) => f.key === flagKey,
      );

      return flag?.active ?? false;
    } catch (error) {
      log.warn(`Error checking feature flag "${flagKey}":`, error);
      return false;
    }
  }

  // Sandbox Environments

  async listSandboxEnvironments(): Promise<SandboxEnvironment[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/sandbox_environments/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/sandbox_environments/`,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch sandbox environments: ${response.statusText}`,
      );
    }
    const data = await response.json();
    return (data.results ?? data) as SandboxEnvironment[];
  }

  async createSandboxEnvironment(
    input: SandboxEnvironmentInput,
  ): Promise<SandboxEnvironment> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/sandbox_environments/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "post",
      url,
      path: `/api/projects/${teamId}/sandbox_environments/`,
      overrides: {
        body: JSON.stringify(input),
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to create sandbox environment: ${response.statusText}`,
      );
    }
    return (await response.json()) as SandboxEnvironment;
  }

  async updateSandboxEnvironment(
    id: string,
    input: Partial<SandboxEnvironmentInput>,
  ): Promise<SandboxEnvironment> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/sandbox_environments/${id}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: `/api/projects/${teamId}/sandbox_environments/${id}/`,
      overrides: {
        body: JSON.stringify(input),
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to update sandbox environment: ${response.statusText}`,
      );
    }
    return (await response.json()) as SandboxEnvironment;
  }

  async deleteSandboxEnvironment(id: string): Promise<void> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/sandbox_environments/${id}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "delete",
      url,
      path: `/api/projects/${teamId}/sandbox_environments/${id}/`,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to delete sandbox environment: ${response.statusText}`,
      );
    }
  }
}
