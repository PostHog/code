import type { IStoragePaths } from "@posthog/platform/storage-paths";
import { app } from "electron";
import { injectable } from "inversify";

@injectable()
export class ElectronStoragePaths implements IStoragePaths {
  public get appDataPath(): string {
    return app.getPath("userData");
  }

  public get logsPath(): string {
    return app.getPath("logs");
  }
}
