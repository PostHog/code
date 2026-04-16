/**
 * Get the filesystem path for a File from a drag-and-drop or file input event.
 *
 * In Electron 32+ with contextIsolation, File.path is empty. The preload
 * script exposes webUtils.getPathForFile as window.electronUtils.getPathForFile
 * to bridge this gap.
 */
export function getFilePath(file: File): string {
  if (window.electronUtils?.getPathForFile) {
    return window.electronUtils.getPathForFile(file);
  }
  return (file as File & { path?: string }).path ?? "";
}
