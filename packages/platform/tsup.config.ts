import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/url-launcher.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  outDir: "dist",
  target: "es2022",
});
