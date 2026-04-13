import { exposeElectronTRPC } from "@posthog/electron-trpc/main";
import { contextBridge, webUtils } from "electron";
import "electron-log/preload";

contextBridge.exposeInMainWorld("electronUtils", {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});

process.once("loaded", async () => {
  exposeElectronTRPC();
});
