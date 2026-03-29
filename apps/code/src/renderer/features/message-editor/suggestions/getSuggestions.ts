import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { CODE_COMMANDS } from "@features/message-editor/commands";
import { getAvailableCommandsForTask } from "@features/sessions/stores/sessionStore";
import {
  fetchRepoFiles,
  pathToFileItem,
  searchFiles,
} from "@hooks/useRepoFiles";
import { trpcClient } from "@renderer/trpc/client";
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

async function getAbsolutePathSuggestion(
  query: string,
): Promise<FileSuggestionItem | null> {
  if (!isAbsolutePath(query)) return null;

  try {
    const exists = await trpcClient.fs.fileExists.query({ filePath: query });
    if (!exists) return null;
  } catch {
    return null;
  }

  const fileItem = pathToFileItem(query);
  return {
    id: query,
    label: fileItem.name,
    description: fileItem.dir || undefined,
    filename: fileItem.name,
    path: query,
  };
}

export async function getFileSuggestions(
  sessionId: string,
  query: string,
): Promise<FileSuggestionItem[]> {
  const repoPath = useDraftStore.getState().contexts[sessionId]?.repoPath;
  const absolutePathSuggestion = getAbsolutePathSuggestion(query);

  if (!repoPath) {
    const resolved = await absolutePathSuggestion;
    return resolved ? [resolved] : [];
  }

  const { files, fzf } = await fetchRepoFiles(repoPath);
  const matched = searchFiles(fzf, files, query);

  const results: FileSuggestionItem[] = matched.map((file) => {
    const parentDir = file.dir ? file.dir.split("/").pop() : undefined;
    const label = parentDir ? `${parentDir}/${file.name}` : file.name;

    return {
      id: file.path,
      label,
      description: file.dir || undefined,
      filename: file.name,
      path: file.path,
    };
  });

  const resolved = await absolutePathSuggestion;
  if (resolved && !results.some((r) => r.id === resolved.id)) {
    results.unshift(resolved);
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
