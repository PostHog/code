import type { IFileIcon } from "@posthog/platform/file-icon";
import { app } from "electron";
import { injectable } from "inversify";

type FileIconModule = typeof import("file-icon");

@injectable()
export class ElectronFileIcon implements IFileIcon {
  private fileIconModule: FileIconModule | undefined;

  public async getAsDataUrl(filePath: string): Promise<string | null> {
    try {
      if (process.platform === "darwin") {
        const mod = await this.loadFileIconModule();
        const uint8Array = await mod.fileIconToBuffer(filePath, { size: 64 });
        const base64 = Buffer.from(uint8Array).toString("base64");
        return `data:image/png;base64,${base64}`;
      }

      const icon = await app.getFileIcon(filePath, { size: "normal" });
      const base64 = icon.toPNG().toString("base64");
      return `data:image/png;base64,${base64}`;
    } catch {
      return null;
    }
  }

  private async loadFileIconModule(): Promise<FileIconModule> {
    if (!this.fileIconModule) {
      this.fileIconModule = await import("file-icon");
    }
    return this.fileIconModule;
  }
}
