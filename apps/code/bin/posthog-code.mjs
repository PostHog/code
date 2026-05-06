#!/usr/bin/env node
// posthog-code CLI — start a task in the running PostHog Code app.
//
// Usage:
//   posthog-code "fix the login bug"
//   posthog-code --repo /path/to/repo --auto --model claude-opus-4-7 "rename foo to bar"
//
// The CLI builds a posthog-code:// deep-link URL and hands it to the OS so the
// running PostHog Code app receives it via its registered protocol handler. If
// the app is not running, the OS will launch it and the link is delivered once
// the renderer is ready.

import { spawn } from "node:child_process";
import { platform as nodePlatform, cwd as nodeCwd, exit } from "node:process";

const ADAPTERS = ["claude", "codex"];
const WORKSPACE_MODES = ["local", "worktree", "cloud"];
const EFFORTS = ["low", "medium", "high"];

const HELP = `posthog-code — start a task in the running PostHog Code app

Usage:
  posthog-code [options] <prompt>

Options:
  --repo <path>            Repository directory (default: current working dir)
  --workspace <mode>       Workspace mode: local | worktree | cloud
  --model <name>           Model id (e.g. claude-opus-4-7)
  --effort <level>         Reasoning effort: low | medium | high
  --adapter <agent>        Agent adapter: claude | codex
  --branch <name>          Base branch
  --auto, --yes            Skip the prefilled UI and create the task immediately
  --dev                    Use the posthog-code-dev:// scheme (dev builds)
  -h, --help               Show this help
  -v, --version            Show version

Environment:
  POSTHOG_CODE_DEV=1       Equivalent to --dev

Examples:
  posthog-code "fix the login redirect"
  posthog-code --auto --model claude-sonnet-4-6 "add tests for the auth saga"
  posthog-code --workspace worktree --branch main "investigate slow query"
`;

const VERSION = "0.1.0";

class CliError extends Error {}

export function parseArgs(rawArgs) {
  const args = {
    prompt: undefined,
    repo: undefined,
    workspace: undefined,
    model: undefined,
    effort: undefined,
    adapter: undefined,
    branch: undefined,
    auto: false,
    dev: false,
    help: false,
    version: false,
  };

  const expectsValue = new Set([
    "--repo",
    "--workspace",
    "--model",
    "--effort",
    "--adapter",
    "--branch",
  ]);

  const promptParts = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      args.version = true;
      continue;
    }
    if (arg === "--auto" || arg === "--yes") {
      args.auto = true;
      continue;
    }
    if (arg === "--dev") {
      args.dev = true;
      continue;
    }
    if (expectsValue.has(arg)) {
      const value = rawArgs[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliError(`Missing value for ${arg}`);
      }
      i++;
      switch (arg) {
        case "--repo":
          args.repo = value;
          break;
        case "--workspace":
          if (!WORKSPACE_MODES.includes(value)) {
            throw new CliError(
              `Invalid --workspace value '${value}' (expected one of ${WORKSPACE_MODES.join(", ")})`,
            );
          }
          args.workspace = value;
          break;
        case "--model":
          args.model = value;
          break;
        case "--effort":
          if (!EFFORTS.includes(value)) {
            throw new CliError(
              `Invalid --effort value '${value}' (expected one of ${EFFORTS.join(", ")})`,
            );
          }
          args.effort = value;
          break;
        case "--adapter":
          if (!ADAPTERS.includes(value)) {
            throw new CliError(
              `Invalid --adapter value '${value}' (expected one of ${ADAPTERS.join(", ")})`,
            );
          }
          args.adapter = value;
          break;
        case "--branch":
          args.branch = value;
          break;
      }
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliError(`Unknown option: ${arg}`);
    }
    promptParts.push(arg);
  }

  if (promptParts.length > 0) {
    args.prompt = promptParts.join(" ");
  }

  return args;
}

export function buildDeepLinkUrl(scheme, args) {
  if (!args.prompt || !args.prompt.trim()) {
    throw new CliError("A prompt is required");
  }

  const params = new URLSearchParams();
  params.set("prompt", args.prompt.trim());
  if (args.repo) params.set("repo", args.repo);
  if (args.workspace) params.set("mode", args.workspace);
  if (args.model) params.set("model", args.model);
  if (args.effort) params.set("effort", args.effort);
  if (args.adapter) params.set("adapter", args.adapter);
  if (args.branch) params.set("branch", args.branch);
  if (args.auto) params.set("auto", "1");

  return `${scheme}://new?${params.toString()}`;
}

export function pickOpener(platform) {
  switch (platform) {
    case "darwin":
      return { command: "open", args: [] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", ""] };
    default:
      return { command: "xdg-open", args: [] };
  }
}

function pickScheme(args, env) {
  const isDev = args.dev || env.POSTHOG_CODE_DEV === "1";
  return isDev ? "posthog-code-dev" : "posthog-code";
}

async function main(argv, env, platform, cwdFn) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`error: ${error.message}\n\n${HELP}`);
      return 1;
    }
    throw error;
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.version) {
    process.stdout.write(`posthog-code ${VERSION}\n`);
    return 0;
  }

  if (!parsed.prompt) {
    process.stderr.write(`error: missing prompt\n\n${HELP}`);
    return 1;
  }

  if (!parsed.repo) {
    parsed.repo = cwdFn();
  }

  const scheme = pickScheme(parsed, env);
  let url;
  try {
    url = buildDeepLinkUrl(scheme, parsed);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const { command, args } = pickOpener(platform);
  const child = spawn(command, [...args, url], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("spawn", resolve);
  });

  process.stdout.write(`Sent task to PostHog Code: ${url}\n`);
  return 0;
}

const isDirectInvocation = import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main(process.argv.slice(2), process.env, nodePlatform, nodeCwd)
    .then((code) => exit(code))
    .catch((error) => {
      process.stderr.write(`fatal: ${error?.message ?? error}\n`);
      exit(1);
    });
}
