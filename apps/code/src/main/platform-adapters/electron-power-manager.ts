import type { IPowerManager } from "@posthog/platform/power-manager";
import { powerMonitor, powerSaveBlocker } from "electron";
import { injectable } from "inversify";

@injectable()
export class ElectronPowerManager implements IPowerManager {
  public onResume(handler: () => void): () => void {
    powerMonitor.on("resume", handler);
    return () => powerMonitor.off("resume", handler);
  }

  public preventSleep(_reason: string): () => void {
    const id = powerSaveBlocker.start("prevent-app-suspension");
    return () => {
      if (powerSaveBlocker.isStarted(id)) {
        powerSaveBlocker.stop(id);
      }
    };
  }
}
