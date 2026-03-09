import fs from "node:fs";
import path from "node:path";
import { getChangedFiles, listAllFiles } from "@twig/git/queries";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../utils/logger.js";
import { FileWatcherEvent } from "../file-watcher/schemas.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import type { FileEntry } from "./schemas.js";

const log = logger.scope("fs");

@injectable()
export class FsService {
  private static readonly CACHE_TTL = 30000;
  private cache = new Map<string, { files: FileEntry[]; timestamp: number }>();

  constructor(
    @inject(MAIN_TOKENS.FileWatcherService)
    private fileWatcher: FileWatcherService,
  ) {
    this.fileWatcher.on(FileWatcherEvent.FileChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.FileDeleted, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.DirectoryChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.GitStateChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });
  }

  async listRepoFiles(
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<FileEntry[]> {
    if (!repoPath) return [];

    try {
      const changedFiles = await getChangedFiles(repoPath);

      if (query?.trim()) {
        const allFiles = await listAllFiles(repoPath);
        const lowerQuery = query.toLowerCase();
        const filtered = allFiles.filter((f) =>
          f.toLowerCase().includes(lowerQuery),
        );
        const limited = limit ? filtered.slice(0, limit) : filtered;
        return this.toFileEntries(limited, changedFiles);
      }

      const cached = this.cache.get(repoPath);
      if (cached && Date.now() - cached.timestamp < FsService.CACHE_TTL) {
        return limit ? cached.files.slice(0, limit) : cached.files;
      }

      const files = await listAllFiles(repoPath);
      const entries = this.toFileEntries(files, changedFiles);
      this.cache.set(repoPath, { files: entries, timestamp: Date.now() });

      return limit ? entries.slice(0, limit) : entries;
    } catch (error) {
      log.error("Error listing repo files:", error);
      return [];
    }
  }

  invalidateCache(repoPath?: string): void {
    if (repoPath) {
      this.cache.delete(repoPath);
    } else {
      this.cache.clear();
    }
  }

  async readRepoFile(
    repoPath: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      return await fs.promises.readFile(
        this.resolvePath(repoPath, filePath),
        "utf-8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.error(`Failed to read file ${filePath}:`, error);
      }
      return null;
    }
  }

  async readAbsoluteFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(path.resolve(filePath), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.error(`Failed to read file ${filePath}:`, error);
      }
      return null;
    }
  }

  async readFileAsBase64(filePath: string): Promise<string | null> {
    const resolved = path.resolve(filePath);
    try {
      const buffer = await fs.promises.readFile(resolved);
      return buffer.toString("base64");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.error(`Failed to read file as base64 ${filePath}:`, error);
        return null;
      }
      // macOS uses narrow no-break space (U+202F) in screenshot filenames
      // but paths often lose this during text processing. Find the actual file.
      const dir = path.dirname(resolved);
      const basename = path.basename(resolved);
      try {
        const files = await fs.promises.readdir(dir);
        const normalizeSpaces = (s: string) =>
          s.replace(/[\s\u00A0\u202F]/g, " ");
        const normalizedTarget = normalizeSpaces(basename);
        const match = files.find(
          (f) => normalizeSpaces(f) === normalizedTarget,
        );
        if (match) {
          const buffer = await fs.promises.readFile(path.join(dir, match));
          return buffer.toString("base64");
        }
      } catch {
        // Directory read failed
      }
      return null;
    }
  }

  async writeRepoFile(
    repoPath: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    await fs.promises.writeFile(
      this.resolvePath(repoPath, filePath),
      content,
      "utf-8",
    );
    this.invalidateCache(repoPath);
  }

  private resolvePath(repoPath: string, filePath: string): string {
    const fullPath = path.join(repoPath, filePath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(repoPath))) {
      throw new Error("Access denied: path outside repository");
    }
    return fullPath;
  }

  private toFileEntries(
    files: string[],
    changedFiles: Set<string>,
  ): FileEntry[] {
    return files.map((p) => ({
      path: p,
      name: path.basename(p),
      changed: changedFiles.has(p),
    }));
  }
}
