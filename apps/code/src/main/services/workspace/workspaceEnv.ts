import path from "node:path";
import { getCurrentBranch, getDefaultBranch } from "@posthog/git/queries";
import type { WorkspaceMode } from "./schemas";

export interface WorkspaceEnvContext {
  taskId: string;
  folderPath: string;
  worktreePath: string | null;
  worktreeName: string | null;
  mode: WorkspaceMode;
  label?: string | null;
}

export interface MultiRepoEnvContext {
  taskId: string;
  workspaces: WorkspaceEnvContext[];
}

const PORT_BASE = 50000;
const PORTS_PER_WORKSPACE = 20;
const MAX_WORKSPACES = 1000;

function hashTaskId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    const char = taskId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function allocateWorkspacePorts(taskId: string): {
  start: number;
  end: number;
  ports: number[];
} {
  const workspaceIndex = hashTaskId(taskId) % MAX_WORKSPACES;
  const start = PORT_BASE + workspaceIndex * PORTS_PER_WORKSPACE;
  const end = start + PORTS_PER_WORKSPACE - 1;

  const ports: number[] = [];
  for (let port = start; port <= end; port++) {
    ports.push(port);
  }

  return { start, end, ports };
}

export async function buildWorkspaceEnv(
  context: WorkspaceEnvContext,
): Promise<Record<string, string>> {
  if (context.mode === "cloud") {
    return {};
  }

  const workspaceName =
    context.worktreeName ?? path.basename(context.folderPath);
  const workspacePath = context.worktreePath ?? context.folderPath;
  const rootPath = context.folderPath;

  const defaultBranch = await getDefaultBranch(rootPath);

  const workspaceBranch = (await getCurrentBranch(workspacePath)) ?? "";

  const portAllocation = allocateWorkspacePorts(context.taskId);

  return {
    POSTHOG_CODE: "1",
    POSTHOG_CODE_WORKSPACE_NAME: workspaceName,
    POSTHOG_CODE_WORKSPACE_PATH: workspacePath,
    POSTHOG_CODE_ROOT_PATH: rootPath,
    POSTHOG_CODE_DEFAULT_BRANCH: defaultBranch,
    POSTHOG_CODE_WORKSPACE_BRANCH: workspaceBranch,
    POSTHOG_CODE_WORKSPACE_PORTS: portAllocation.ports.join(","),
    POSTHOG_CODE_WORKSPACE_PORTS_RANGE: String(PORTS_PER_WORKSPACE),
    POSTHOG_CODE_WORKSPACE_PORTS_START: String(portAllocation.start),
    POSTHOG_CODE_WORKSPACE_PORTS_END: String(portAllocation.end),
  };
}

/**
 * Build env vars for multi-repo tasks. Includes indexed per-repo vars
 * (POSTHOG_CODE_REPO_0_*, POSTHOG_CODE_REPO_1_*, etc.) alongside the
 * legacy single-repo vars from the first workspace.
 */
export async function buildMultiRepoWorkspaceEnv(
  context: MultiRepoEnvContext,
): Promise<Record<string, string>> {
  const nonCloudWorkspaces = context.workspaces.filter(
    (ws) => ws.mode !== "cloud",
  );
  if (nonCloudWorkspaces.length === 0) return {};

  // Legacy vars from first workspace
  const legacyEnv = await buildWorkspaceEnv(nonCloudWorkspaces[0]);

  // Indexed per-repo vars
  const repoEnv: Record<string, string> = {
    POSTHOG_CODE_REPO_COUNT: String(nonCloudWorkspaces.length),
  };

  for (let i = 0; i < nonCloudWorkspaces.length; i++) {
    const ws = nonCloudWorkspaces[i];
    const prefix = `POSTHOG_CODE_REPO_${i}`;
    const wsPath = ws.worktreePath ?? ws.folderPath;
    const wsName = ws.label ?? ws.worktreeName ?? path.basename(ws.folderPath);

    repoEnv[`${prefix}_NAME`] = wsName;
    repoEnv[`${prefix}_PATH`] = wsPath;

    try {
      repoEnv[`${prefix}_BRANCH`] = (await getCurrentBranch(wsPath)) ?? "";
    } catch {
      repoEnv[`${prefix}_BRANCH`] = "";
    }
  }

  return { ...legacyEnv, ...repoEnv };
}
