import type {
  IRepositoryRepository,
  Repository,
} from "./repository-repository";

export function createMockRepositoryRepository(): IRepositoryRepository {
  const repos = new Map<string, Repository>();
  const pathIndex = new Map<string, string>();

  return {
    findAll: () => Array.from(repos.values()),
    findById: (id: string) => repos.get(id) ?? null,
    findByPath: (p: string) => {
      const id = pathIndex.get(p);
      return id ? (repos.get(id) ?? null) : null;
    },
    create: (data: { path: string; id?: string }) => {
      const now = new Date().toISOString();
      const repo: Repository = {
        id: data.id ?? crypto.randomUUID(),
        path: data.path,
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      repos.set(repo.id, repo);
      pathIndex.set(repo.path, repo.id);
      return repo;
    },
    upsertByPath: (p: string, id?: string) => {
      const existing = pathIndex.get(p);
      if (existing) {
        const repo = repos.get(existing)!;
        repo.lastAccessedAt = new Date().toISOString();
        return repo;
      }
      const now = new Date().toISOString();
      const repo: Repository = {
        id: id ?? crypto.randomUUID(),
        path: p,
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      repos.set(repo.id, repo);
      pathIndex.set(repo.path, repo.id);
      return repo;
    },
    updateLastAccessed: (id: string) => {
      const repo = repos.get(id);
      if (repo) {
        repo.lastAccessedAt = new Date().toISOString();
      }
    },
    delete: (id: string) => {
      const repo = repos.get(id);
      if (repo) {
        pathIndex.delete(repo.path);
        repos.delete(id);
      }
    },
    deleteAll: () => {
      repos.clear();
      pathIndex.clear();
    },
  };
}
