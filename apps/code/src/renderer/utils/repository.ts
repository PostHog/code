import type { Task } from "@shared/types";

export const parseRepository = (
  repository: string,
): { organization: string; repoName: string } | null => {
  const result = repository.split("/");

  if (result.length !== 2) {
    return null;
  }

  return { organization: result[0], repoName: result[1] };
};

/** Returns the first repository for a task (backward compat). */
export function getTaskRepository(task: Task): string | null {
  if (task.repositories && task.repositories.length > 0) {
    return task.repositories[0].repository;
  }
  return task.repository ?? null;
}

/** Returns all repositories for a task. */
export function getTaskRepositories(task: Task): string[] {
  if (task.repositories && task.repositories.length > 0) {
    return task.repositories.map((r) => r.repository);
  }
  if (task.repository) {
    return [task.repository];
  }
  return [];
}
