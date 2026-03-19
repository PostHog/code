> [!IMPORTANT]
> PostHog Code is pre-alpha and not production-ready. Interested? Email jonathan@posthog.com

**[Download the latest version](https://github.com/PostHog/code/releases/latest)**

Found a bug or have feedback? [Open an issue](https://github.com/PostHog/code/issues/new) on GitHub.

# PostHog Code

This is the monorepo for PostHog Code apps and the agent framework that powers them.

## Development

### Prerequisites

- Node.js 22+
- pnpm 10.23.0

### Setup

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies for all packages
pnpm install

# Copy environment config
cp .env.example .env

# phrocs is auto-installed on first `pnpm dev`
```

### Running in Development

```bash
# Run both agent (watch mode) and code app in parallel
pnpm dev

# Or run them separately:
pnpm dev:agent  # Run agent in watch mode
pnpm dev:code   # Run code app
```

> **Want to connect to a local PostHog instance?** See [docs/LOCAL-DEVELOPMENT.md](./docs/LOCAL-DEVELOPMENT.md) for OAuth setup and connecting to localhost:8010.

### Utility Scripts

Scripts in `scripts/` for development and debugging:

| Script | Description |
|--------|-------------|
| `scripts/clean-posthog-code-macos.sh` | Remove all PostHog Code app data from macOS (caches, preferences, logs, saved state). Use `--app` flag to also delete PostHog Code.app from /Applications. |
| `scripts/test-access-token.js` | Validate a PostHog OAuth access token by testing API endpoints. Usage: `node scripts/test-access-token.js <token> <project_id> [region]` |

## Project Structure

```
posthog-code/
├── apps/
│   ├── code/            # Electron desktop app (React, Vite)
│   ├── mobile/          # React Native mobile app (Expo)
│   └── cli/             # CLI for stacked PRs
├── packages/
│   ├── agent/           # TypeScript agent framework
│   ├── core/            # Shared business logic
│   ├── electron-trpc/   # tRPC for Electron IPC
│   └── shared/          # Shared utilities (Saga pattern, etc.)
```

## Documentation

| File | Description |
|------|-------------|
| [apps/code/README.md](./apps/code/README.md) | Desktop app: building, signing, distribution, and workspace configuration |
| [apps/code/ARCHITECTURE.md](./apps/code/ARCHITECTURE.md) | Desktop app: dependency injection, tRPC, state management, and events |
| [apps/mobile/README.md](./apps/mobile/README.md) | Mobile app: Expo setup, EAS builds, and TestFlight deployment |
| [apps/cli/README.md](./apps/cli/README.md) | CLI: stacked PR management with Jujutsu |
| [CLAUDE.md](./CLAUDE.md) | Code style, patterns, and testing guidelines |
| [docs/LOCAL-DEVELOPMENT.md](./docs/LOCAL-DEVELOPMENT.md) | Connecting PostHog Code to a local PostHog instance |
| [docs/UPDATES.md](./docs/UPDATES.md) | Release versioning and git tagging |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues and fixes |

## Troubleshooting

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues (black screen, Electron install failures, native module crashes, etc.).
