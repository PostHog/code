import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  createForceDevModeDefine,
  createPosthogPlugin,
  rendererAliases,
} from "./vite.shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
);

function hedgehogAssetsPlugin(): Plugin {
  const assetsSrc = path.resolve(
    __dirname,
    "node_modules/@posthog/hedgehog-mode/assets",
  );

  function copyAssets(outDir: string) {
    const dest = path.join(outDir, "hedgehog-mode");
    if (!existsSync(assetsSrc)) return;
    mkdirSync(dest, { recursive: true });
    for (const file of readdirSync(assetsSrc)) {
      copyFileSync(path.join(assetsSrc, file), path.join(dest, file));
    }
  }

  return {
    name: "hedgehog-assets",
    writeBundle(options) {
      const outDir =
        options.dir ||
        path.resolve(__dirname, ".vite/build/renderer/main_window");
      copyAssets(outDir);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");

  return {
    plugins: [
      react(),
      tsconfigPaths(),
      createPosthogPlugin(env),
      hedgehogAssetsPlugin(),
    ].filter(Boolean),
    build: {
      sourcemap: true,
    },
    envDir: path.resolve(__dirname, "../.."),
    define: {
      ...createForceDevModeDefine(),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: rendererAliases,
      dedupe: ["react", "react-dom"],
    },
  };
});
