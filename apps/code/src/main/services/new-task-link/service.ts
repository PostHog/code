import type { IMainWindow } from "@posthog/platform/main-window";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { DeepLinkService } from "../deep-link/service";

const log = logger.scope("new-task-link-service");

const ADAPTERS = ["claude", "codex"] as const;
const WORKSPACE_MODES = ["local", "worktree", "cloud"] as const;
const EFFORTS = ["low", "medium", "high"] as const;

type Adapter = (typeof ADAPTERS)[number];
type WorkspaceMode = (typeof WORKSPACE_MODES)[number];
type Effort = (typeof EFFORTS)[number];

export const NewTaskLinkEvent = {
  OpenNewTask: "openNewTask",
} as const;

export interface NewTaskLinkPayload {
  prompt: string;
  repo?: string;
  branch?: string;
  model?: string;
  effort?: Effort;
  adapter?: Adapter;
  mode?: WorkspaceMode;
  auto: boolean;
}

export interface NewTaskLinkEvents {
  [NewTaskLinkEvent.OpenNewTask]: NewTaskLinkPayload;
}

export type PendingNewTaskLink = NewTaskLinkPayload;

function pickEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  paramName: string,
): T | undefined {
  if (!value) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  log.warn(
    `Ignoring invalid '${paramName}' value: ${value} (expected one of ${allowed.join(", ")})`,
  );
  return undefined;
}

function parseAuto(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

@injectable()
export class NewTaskLinkService extends TypedEventEmitter<NewTaskLinkEvents> {
  private pendingDeepLink: PendingNewTaskLink | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
    @inject(MAIN_TOKENS.MainWindow)
    private readonly mainWindow: IMainWindow,
  ) {
    super();

    this.deepLinkService.registerHandler("new", (_path, params) =>
      this.handleNewTaskLink(params),
    );
  }

  private handleNewTaskLink(params: URLSearchParams): boolean {
    const prompt = params.get("prompt")?.trim();
    if (!prompt) {
      log.warn("New-task link missing 'prompt' query param");
      return false;
    }

    const payload: NewTaskLinkPayload = {
      prompt,
      repo: params.get("repo") ?? undefined,
      branch: params.get("branch") ?? undefined,
      model: params.get("model") ?? undefined,
      effort: pickEnum(params.get("effort"), EFFORTS, "effort"),
      adapter: pickEnum(params.get("adapter"), ADAPTERS, "adapter"),
      mode: pickEnum(params.get("mode"), WORKSPACE_MODES, "mode"),
      auto: parseAuto(params.get("auto")),
    };

    const hasListeners = this.listenerCount(NewTaskLinkEvent.OpenNewTask) > 0;

    if (hasListeners) {
      log.info("Emitting new-task link event", {
        repo: payload.repo,
        auto: payload.auto,
      });
      this.emit(NewTaskLinkEvent.OpenNewTask, payload);
    } else {
      log.info("Queueing new-task link (renderer not ready)", {
        repo: payload.repo,
        auto: payload.auto,
      });
      this.pendingDeepLink = payload;
    }

    log.info("Deep link focusing window");
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.focus();

    return true;
  }

  public consumePendingDeepLink(): PendingNewTaskLink | null {
    const pending = this.pendingDeepLink;
    this.pendingDeepLink = null;
    if (pending) {
      log.info("Consumed pending new-task link", {
        repo: pending.repo,
        auto: pending.auto,
      });
    }
    return pending;
  }
}
