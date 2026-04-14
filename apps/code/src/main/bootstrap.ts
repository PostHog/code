/**
 * Bootstrap entry point — the single place that knows about electron AND the
 * env-var boundary used by utility singletons.
 *
 * Runs BEFORE any service / util is imported. Sets:
 *   1. app name + custom userData path (needed for single-instance lock, stores, etc.)
 *   2. env vars that utility singletons (utils/logger, utils/env, utils/store,
 *      utils/fixPath, utils/otel-log-transport, services/settingsStore) read
 *      at module load. These utils do NOT import from "electron" — they only
 *      read from process.env, which keeps them portable.
 *
 * Static import of utils/fixPath is safe because fixPath reads process.env at
 * CALL time, not at module load. The main app body loads via dynamic
 * `import("./index.js")` so env vars are guaranteed to be set first.
 */

import dns from "node:dns";
import path from "node:path";
import { app, protocol } from "electron";
import { fixPath } from "./utils/fixPath";

const isDev = !app.isPackaged;

// Set app name for single-instance lock, crashReporter, etc
const appName = isDev ? "posthog-code-dev" : "posthog-code";
app.setName(isDev ? "PostHog Code (Development)" : "PostHog Code");

// Set userData path for @posthog/code
const appDataPath = app.getPath("appData");
const userDataPath = path.join(appDataPath, "@posthog", appName);
app.setPath("userData", userDataPath);

// Export the electron-derived state to env so utility singletons (utils/*,
// services/settingsStore) can read it without importing from "electron".
// MUST happen before any project module evaluates code that reads these.
process.env.POSTHOG_CODE_DATA_DIR = userDataPath;
process.env.POSTHOG_CODE_IS_DEV = String(isDev);
process.env.POSTHOG_CODE_VERSION = app.getVersion();

// Force IPv4 resolution when "localhost" is used so the agent hits 127.0.0.1
// instead of ::1. This matches how the renderer already reaches the PostHog API.
dns.setDefaultResultOrder("ipv4first");

// Call fixPath early to ensure PATH is correct for any child processes
fixPath();

// Register mcp-sandbox: protocol scheme for MCP Apps iframe isolation.
// Must be called before app.ready — gives the sandbox proxy its own origin
// so MCP Apps can't access the renderer's DOM, storage, or cookies.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "mcp-sandbox",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

// Now dynamically import the rest of the application.
// Dynamic import ensures env vars are set BEFORE index.js is evaluated —
// static imports are hoisted and would run before our process.env writes.
import("./index.js");
