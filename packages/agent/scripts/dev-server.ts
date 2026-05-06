#!/usr/bin/env tsx
// Boots AgentServer locally for poking with curl. Mocks the PostHog API via
// msw and stamps a fake session so /command works without a real backend or
// agent runtime spawn. Use only for endpoint smoke tests.

import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { setupServer } from "msw/node";
import { AgentServer } from "../src/server/agent-server";
import { SANDBOX_CONNECTION_AUDIENCE } from "../src/server/jwt";
import { createPostHogHandlers } from "../src/test/mocks/msw-handlers";

const PORT = Number(process.env.PORT ?? 3001);
const TASK_ID = process.env.TASK_ID ?? "test-task-id";
const RUN_ID = process.env.RUN_ID ?? "test-run-id";
const PROJECT_ID = Number(process.env.PROJECT_ID ?? 1);
const API_URL = "http://localhost:8000";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const mswServer = setupServer(...createPostHogHandlers({ baseUrl: API_URL }));
mswServer.listen({ onUnhandledRequest: "bypass" });

const repoPath = mkdtempSync(join(tmpdir(), "agent-server-dev-"));
execFileSync("git", ["init", "-q"], { cwd: repoPath });
execFileSync("git", ["config", "user.email", "dev@local"], { cwd: repoPath });
execFileSync("git", ["config", "user.name", "Dev"], { cwd: repoPath });
execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: repoPath });
execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], {
  cwd: repoPath,
});

const server = new AgentServer({
  port: PORT,
  jwtPublicKey: publicKey,
  repositoryPath: repoPath,
  apiUrl: API_URL,
  apiKey: "dev-api-key",
  projectId: PROJECT_ID,
  mode: "interactive",
  taskId: TASK_ID,
  runId: RUN_ID,
});

// start() runs autoInitializeSession() which would spawn a real Claude/Codex
// runtime. We don't need that to exercise the HTTP routes — no-op it.
(
  server as unknown as { autoInitializeSession: () => Promise<void> }
).autoInitializeSession = async () => {
  console.log("[dev-server] skipped autoInitializeSession");
};

await server.start();

// /command's route checks session.payload.run_id; set_token's handler only
// needs `this.session` to be truthy. Stamp the minimum shape that satisfies
// both. Other commands (user_message, cancel, etc.) will still fail because
// they touch session.clientConnection — that's fine.
(server as unknown as { session: unknown }).session = {
  payload: {
    run_id: RUN_ID,
    task_id: TASK_ID,
    team_id: PROJECT_ID,
    user_id: 0,
    distinct_id: "dev",
    mode: "interactive",
  },
};

const token = jwt.sign(
  {
    run_id: RUN_ID,
    task_id: TASK_ID,
    team_id: PROJECT_ID,
    user_id: 1,
    distinct_id: "dev",
    mode: "interactive",
    aud: SANDBOX_CONNECTION_AUDIENCE,
  },
  privateKey,
  { algorithm: "RS256", expiresIn: 3600 },
);

const base = `http://localhost:${PORT}`;
console.log("");
console.log(`agent-server listening on ${base}`);
console.log(`repo: ${repoPath}`);
console.log("");
console.log(`export TOKEN='${token}'`);
console.log("");
console.log("# health (no auth)");
console.log(`curl ${base}/health`);
console.log("");
console.log("# /gh (loopback only, no auth)");
console.log(
  `curl -X POST ${base}/gh -H 'Content-Type: application/json' -d '{"args":["--version"]}'`,
);
console.log("");
console.log("# set_token via /command (JWT required)");
console.log(
  `curl -X POST ${base}/command -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"set_token","params":{"token":"ghp_dev_test"}}'`,
);
console.log("");
console.log("ctrl-c to stop.");

const shutdown = async () => {
  console.log("\n[dev-server] shutting down");
  mswServer.close();
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
