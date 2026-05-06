export interface IBundledResources {
  /**
   * Resolve a bundled resource (code, asset) to an absolute path on disk.
   * On desktop this handles ASAR .unpacked resolution; on server this points
   * to the app install directory; on mobile this resolves under the app bundle.
   */
  resolve(relativePath: string): string;

  /**
   * Resolve a path inside the app's "extra resources" directory — files
   * shipped alongside the app via Electron Forge's `extraResource` config.
   * On macOS this is `<App>.app/Contents/Resources/<relativePath>` in
   * production; in dev it falls back to the project source layout so the
   * same lookup works during development.
   */
  resolveExtraResource(relativePath: string): string;
}
