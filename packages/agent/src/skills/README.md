# Skills

Provides PostHog skills to agent sessions (Claude Code and Codex). Skills are markdown instruction files that teach agents how to use PostHog APIs. Each skill is a directory containing a `SKILL.md` and optional `references/` folder with supporting docs.

Skills are published independently from PostHog Code at a stable GitHub releases URL (`skills.zip`). `SkillsManager` ensures agents always have the latest skills without requiring a PostHog Code update.

## Skill Sources

The plugin directory is assembled from three skill sources, merged in priority order (later overrides earlier for same-named skills):

| Source | Location | When used |
|---|---|---|
| **Shipped** | `plugins/posthog/skills/` | Always — committed to the repo |
| **Remote** | GitHub releases `skills.zip` | Downloaded at build time and every 30 min at runtime |
| **Local dev** | `plugins/posthog/local-skills/` | Dev mode only — gitignored |

A "skill name" is its directory name. If remote and shipped both have `query-data/`, the remote version wins. If local-dev also has `query-data/`, that wins over both.

## Key Files

- `skills-manager.ts` — `SkillsManager` class: throttled/guarded skill updates, periodic refresh, overlay and Codex sync
- `update-skills-saga.ts` — atomic multi-step saga for downloading, extracting, and installing skills with rollback
- `constants.ts` — `SKILLS_ZIP_URL`, `CONTEXT_MILL_ZIP_URL`, `DEFAULT_UPDATE_INTERVAL_MS`

## Runtime Flow

`SkillsManager` is instantiated by consumers (Electron app or cloud agent server) with injectable paths and a `downloadFile` function.

**On startup:**
1. Overlay any previously-downloaded remote skills into the runtime plugin dir
2. Sync skills to `$HOME/.agents/skills/` for Codex
3. Start a 30-minute interval timer
4. Kick off the first async download

**Every 30 minutes (`updateSkills`):**
1. Download `skills.zip` (via the injected `downloadFile`)
2. Extract to a temp dir, then atomically install into `runtimeSkillsDir`
3. Re-overlay into the runtime plugin dir
4. Re-sync to Codex
5. On failure: log a warning, keep existing skills, retry next interval

A throttle guard prevents more than one run per interval, and a reentrance guard skips concurrent calls.

## Consumers

### Electron app (`apps/code`)

Plugin setup is bootstrapped in `main/index.ts` via `setupPluginSkills()`. It uses `net.fetch` for downloads (Electron's network stack, respects system proxy).

Plugin path resolution (`getPluginPath()`) lives in `AgentService` and is called when starting each session:
- Dev mode → bundled path (`.vite/build/plugins/posthog`)
- Prod → `{userData}/plugins/posthog/` (with downloaded updates)
- Fallback → bundled path

### Cloud agent server (`packages/agent`)

`AgentServer` instantiates `SkillsManager` directly on startup using native `fetch`.

## Build Time

`copyPosthogPlugin()` in `apps/code/vite.main.config.mts` assembles the plugin during `writeBundle`:

1. Copies allowed plugin entries into `.vite/build/plugins/posthog/`
2. Downloads `skills.zip` via `curl`, extracts with `fflate`, overlays into the build output
3. Downloads context-mill omnibus skills and merges them in
4. In dev mode only: overlays `plugins/posthog/local-skills/` on top
5. Download failures are non-fatal — build continues with shipped skills only

## Dev Workflow

### Testing with local skills

1. Create a skill directory in `plugins/posthog/local-skills/`, e.g.:
   ```
   plugins/posthog/local-skills/my-skill/SKILL.md
   ```
2. Run `pnpm dev:code` — Vite watches and hot-reloads
3. The local skill overrides any shipped or remote skill with the same name

### Pulling remote skills locally for editing

```sh
pnpm pull-skills
```

Downloads the latest `skills.zip` into `plugins/posthog/local-skills/`. Edit them locally and Vite will pick up changes.
