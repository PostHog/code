import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/url-launcher.ts",
    "src/storage-paths.ts",
    "src/app-meta.ts",
    "src/dialog.ts",
    "src/clipboard.ts",
    "src/file-icon.ts",
    "src/secure-storage.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  outDir: "dist",
  target: "es2022",
});
