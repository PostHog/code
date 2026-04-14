import type {
  ConfirmOptions,
  DialogSeverity,
  IDialog,
  PickFileOptions,
} from "@posthog/platform/dialog";
import {
  BrowserWindow,
  dialog,
  type MessageBoxOptions,
  type OpenDialogOptions,
} from "electron";
import { injectable } from "inversify";

type OpenDialogProperty = NonNullable<OpenDialogOptions["properties"]>[number];

function severityToType(severity?: DialogSeverity): MessageBoxOptions["type"] {
  return severity ?? "none";
}

function buildProperties(options: PickFileOptions): OpenDialogProperty[] {
  const properties: OpenDialogProperty[] = [
    options.directories ? "openDirectory" : "openFile",
    "treatPackageAsDirectory",
  ];
  if (options.multiple) properties.push("multiSelections");
  if (options.createDirectories) properties.push("createDirectory");
  return properties;
}

@injectable()
export class ElectronDialog implements IDialog {
  public async confirm(options: ConfirmOptions): Promise<number> {
    const parent = BrowserWindow.getFocusedWindow();
    const electronOptions: MessageBoxOptions = {
      type: severityToType(options.severity),
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.options,
      defaultId: options.defaultIndex,
      cancelId: options.cancelIndex,
    };
    const result = parent
      ? await dialog.showMessageBox(parent, electronOptions)
      : await dialog.showMessageBox(electronOptions);
    return result.response;
  }

  public async pickFile(options: PickFileOptions): Promise<string[]> {
    const parent = BrowserWindow.getFocusedWindow();
    const electronOptions: OpenDialogOptions = {
      title: options.title,
      properties: buildProperties(options),
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, electronOptions)
      : await dialog.showOpenDialog(electronOptions);
    return result.canceled ? [] : result.filePaths;
  }
}
