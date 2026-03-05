import os from "node:os";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const appName = process.env.NODE_ENV === "production" ? "Twig" : "twig-dev";
const userDataPath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "@posthog",
  appName,
);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/main/db/schema.ts",
  out: "./src/main/db/migrations",
  dbCredentials: {
    url: path.join(userDataPath, "twig.db"),
  },
});
