import type { IPowerManager } from "@posthog/platform/power-manager";
import { inject, injectable, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { settingsStore } from "../settingsStore";

const log = logger.scope("sleep");

@injectable()
export class SleepService {
  private enabled: boolean;
  private releaseBlocker: (() => void) | null = null;
  private activeActivities = new Set<string>();

  constructor(
    @inject(MAIN_TOKENS.PowerManager)
    private readonly powerManager: IPowerManager,
  ) {
    this.enabled = settingsStore.get("preventSleepWhileRunning", false);
  }

  setEnabled(enabled: boolean): void {
    log.info("setEnabled", { enabled });
    this.enabled = enabled;
    settingsStore.set("preventSleepWhileRunning", enabled);
    this.updateBlocker();
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  acquire(activityId: string): void {
    this.activeActivities.add(activityId);
    this.updateBlocker();
  }

  release(activityId: string): void {
    this.activeActivities.delete(activityId);
    this.updateBlocker();
  }

  @preDestroy()
  cleanup(): void {
    this.stopBlocker();
  }

  private updateBlocker(): void {
    if (this.enabled && this.activeActivities.size > 0) {
      this.startBlocker();
    } else {
      this.stopBlocker();
    }
  }

  private startBlocker(): void {
    if (this.releaseBlocker) return;
    this.releaseBlocker = this.powerManager.preventSleep(
      "prevent-app-suspension",
    );
    log.info("Started power save blocker");
  }

  private stopBlocker(): void {
    if (!this.releaseBlocker) return;
    log.info("Stopping power save blocker");
    this.releaseBlocker();
    this.releaseBlocker = null;
  }
}
