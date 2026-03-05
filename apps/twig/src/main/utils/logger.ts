import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main";

const LOG_DIR = join(app.getPath("home"), ".twig", "logs");
const LOG_FILE = "main.log";
const MAX_ARCHIVES = 3;

mkdirSync(LOG_DIR, { recursive: true });

log.initialize();

log.transports.file.resolvePathFn = () => join(LOG_DIR, LOG_FILE);
log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB
log.transports.file.archiveLogFn = (oldLogFile) => {
  const dir = LOG_DIR;
  const archivePath = (n: number) => join(dir, `main.${n}.log`);

  try {
    const lastArchive = archivePath(MAX_ARCHIVES);
    if (existsSync(lastArchive)) {
      unlinkSync(lastArchive);
    }

    for (let i = MAX_ARCHIVES - 1; i >= 1; i--) {
      const from = archivePath(i);
      if (existsSync(from)) {
        renameSync(from, archivePath(i + 1));
      }
    }

    renameSync(oldLogFile.path, archivePath(1));
  } catch {
    // Best-effort rotation
  }
};

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const level = isDev ? "debug" : "info";
log.transports.file.level = level;
log.transports.console.level = level;
log.transports.ipc.level = level;

export const logger = log;
export type Logger = typeof logger;
export type ScopedLogger = ReturnType<typeof logger.scope>;

export function getLogFilePath(): string {
  return join(LOG_DIR, LOG_FILE);
}
