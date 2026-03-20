import fs from "node:fs/promises";
import path from "node:path";
import { injectable } from "inversify";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  type CreateEnvironmentInput,
  type Environment,
  type EnvironmentAction,
  environmentSchema,
  type UpdateEnvironmentInput,
} from "./schemas";

const ENVIRONMENTS_DIR = ".posthog-code/environments";

function environmentsDir(repoPath: string): string {
  return path.join(repoPath, ENVIRONMENTS_DIR);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ScannedEnvironment {
  filePath: string;
  environment: Environment;
}

@injectable()
export class EnvironmentService {
  private async scanEnvironmentFiles(
    repoPath: string,
  ): Promise<ScannedEnvironment[]> {
    const dir = environmentsDir(repoPath);

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }

    const results: ScannedEnvironment[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".toml")) continue;

      const filePath = path.join(dir, entry);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const parsed = parseToml(content);
        const environment = environmentSchema.parse(parsed);
        results.push({ filePath, environment });
      } catch {}
    }

    return results;
  }

  private async findFileById(
    repoPath: string,
    id: string,
  ): Promise<ScannedEnvironment | null> {
    const files = await this.scanEnvironmentFiles(repoPath);
    return files.find((f) => f.environment.id === id) ?? null;
  }

  private async uniqueFilePath(dir: string, slug: string): Promise<string> {
    let candidate = path.join(dir, `${slug}.toml`);
    let suffix = 2;

    while (true) {
      try {
        await fs.access(candidate);
        candidate = path.join(dir, `${slug}-${suffix}.toml`);
        suffix++;
      } catch {
        return candidate;
      }
    }
  }

  async listEnvironments(repoPath: string): Promise<Environment[]> {
    const files = await this.scanEnvironmentFiles(repoPath);
    return files.map((f) => f.environment);
  }

  async getEnvironment(
    repoPath: string,
    id: string,
  ): Promise<Environment | null> {
    const found = await this.findFileById(repoPath, id);
    return found?.environment ?? null;
  }

  async createEnvironment(
    input: Omit<CreateEnvironmentInput, "repoPath">,
    repoPath: string,
  ): Promise<Environment> {
    const dir = environmentsDir(repoPath);
    await fs.mkdir(dir, { recursive: true });

    const id = crypto.randomUUID();
    const actions: EnvironmentAction[] | undefined = input.actions?.map(
      (a) => ({
        ...a,
        id: crypto.randomUUID(),
      }),
    );

    const environment: Environment = {
      id,
      version: 1,
      name: input.name,
      setup: input.setup,
      actions,
    };

    const slug = slugify(input.name);
    const filePath = await this.uniqueFilePath(dir, slug || "environment");
    await fs.writeFile(filePath, stringifyToml(environment), "utf-8");

    return environment;
  }

  async updateEnvironment(
    input: Omit<UpdateEnvironmentInput, "repoPath">,
    repoPath: string,
  ): Promise<Environment> {
    const found = await this.findFileById(repoPath, input.id);
    if (!found) {
      throw new Error(`Environment not found: ${input.id}`);
    }

    const existing = found.environment;

    const actions: EnvironmentAction[] | undefined = input.actions?.map(
      (a) => ({
        ...a,
        id: a.id ?? crypto.randomUUID(),
      }),
    );

    const updated: Environment = {
      id: existing.id,
      version: existing.version,
      name: input.name ?? existing.name,
      setup: input.setup !== undefined ? input.setup : existing.setup,
      actions: actions !== undefined ? actions : existing.actions,
    };

    await fs.writeFile(found.filePath, stringifyToml(updated), "utf-8");

    return updated;
  }

  async deleteEnvironment(repoPath: string, id: string): Promise<void> {
    const found = await this.findFileById(repoPath, id);
    if (!found) {
      throw new Error(`Environment not found: ${id}`);
    }
    await fs.unlink(found.filePath);
  }
}
