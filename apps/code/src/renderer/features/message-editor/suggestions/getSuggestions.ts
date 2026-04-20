import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { CODE_COMMANDS } from "@features/message-editor/commands";
import { getAvailableCommandsForTask } from "@features/sessions/stores/sessionStore";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import {
  fetchRepoFiles,
  pathToFileItem,
  searchFiles,
} from "@hooks/useRepoFiles";
import { isAbsolutePath } from "@utils/path";
import Fuse, { type IFuseOptions } from "fuse.js";
import { useDraftStore } from "../stores/draftStore";
import type { CommandSuggestionItem, FileSuggestionItem } from "../types";

const COMMAND_FUSE_OPTIONS: IFuseOptions<AvailableCommand> = {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "description", weight: 0.3 },
  ],
  threshold: 0.3,
  includeScore: true,
};

function searchCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  if (!query.trim()) {
    return commands;
  }

  const fuse = new Fuse(commands, COMMAND_FUSE_OPTIONS);
  const results = fuse.search(query);

  const lowerQuery = query.toLowerCase();
  results.sort((a, b) => {
    const aStartsWithQuery = a.item.name.toLowerCase().startsWith(lowerQuery);
    const bStartsWithQuery = b.item.name.toLowerCase().startsWith(lowerQuery);

    if (aStartsWithQuery && !bStartsWithQuery) return -1;
    if (!aStartsWithQuery && bStartsWithQuery) return 1;
    return (a.score ?? 0) - (b.score ?? 0);
  });

  return results.map((result) => result.item);
}

function parentDirLabel(dir: string, name: string): string {
  const parent = dir.split("/").filter(Boolean).pop();
  return parent ? `${parent}/${name}` : name;
}

function getAbsolutePathSuggestion(query: string): FileSuggestionItem | null {
  if (!isAbsolutePath(query)) return null;
  if (!/\.\w+$/.test(query)) return null;

  const fileItem = pathToFileItem(query);
  return {
    id: query,
    label: parentDirLabel(fileItem.dir, fileItem.name),
    description: fileItem.dir || undefined,
    filename: fileItem.name,
    path: query,
  };
}

export async function getFileSuggestions(
  sessionId: string,
  query: string,
): Promise<FileSuggestionItem[]> {
  const context = useDraftStore.getState().contexts[sessionId];
  const repoPath = context?.repoPath;
  const absoluteMatch = getAbsolutePathSuggestion(query);

  if (!repoPath) {
    return absoluteMatch ? [absoluteMatch] : [];
  }

  // Collect all repo paths: primary + additional workspaces for multi-repo tasks
  const repoPaths = [repoPath];
  if (context?.taskId) {
    const taskWorkspaces = await workspaceApi.getTaskWorkspaces(context.taskId);
    for (const ws of taskWorkspaces.slice(1)) {
      const wsPath = ws.worktreePath ?? ws.folderPath;
      if (wsPath && wsPath !== repoPath) {
        repoPaths.push(wsPath);
      }
    }
  }

  // Search files across all repo paths in parallel
  const allRepoResults = await Promise.all(
    repoPaths.map(async (path) => {
      const { files, fzf } = await fetchRepoFiles(path);
      const matched = searchFiles(fzf, files, query);
      const repoName = path.split("/").pop() ?? path;
      return matched.map((file) => ({
        id: file.path,
        label: parentDirLabel(file.dir, file.name),
        description:
          repoPaths.length > 1
            ? `${repoName}/${file.dir || ""}`
            : file.dir || undefined,
        filename: file.name,
        path: file.path,
      }));
    }),
  );

  const results: FileSuggestionItem[] = allRepoResults.flat();

  if (absoluteMatch && !results.some((r) => r.id === absoluteMatch.id)) {
    results.unshift(absoluteMatch);
  }

  return results;
}

export function getCommandSuggestions(
  sessionId: string,
  query: string,
): CommandSuggestionItem[] {
  const store = useDraftStore.getState();
  const taskId = store.contexts[sessionId]?.taskId;
  const agentCommands = taskId
    ? getAvailableCommandsForTask(taskId)
    : (store.commands[sessionId] ?? []);
  const merged = [...CODE_COMMANDS, ...agentCommands];
  const commands = [...new Map(merged.map((cmd) => [cmd.name, cmd])).values()];
  const filtered = searchCommands(commands, query);

  return filtered.map((cmd) => ({
    id: cmd.name,
    label: cmd.name,
    description: cmd.description,
    command: cmd,
  }));
}
