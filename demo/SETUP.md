# PostHog Code Beta Launch Video — Demo Setup Guide

Everything below walks through setting up the full demo environment for the
launch video. Items are grouped by system. **Work through them in order** — some
steps depend on earlier ones.

---

## 0. Prerequisites

| What | Why |
|------|-----|
| PostHog Cloud project (or local dev instance with Temporal + ClickHouse) | Backend for signals, tasks, error tracking |
| GitHub org with repos `PostHog/hogflix` and `PostHog/onlyhogs` | Agent needs repos to target for PRs |
| PostHog Code app built from this repo | The app being demoed |
| Your PostHog project API key | For SDK instrumentation in demo apps |
| `gh` CLI authenticated | For PR creation during demo |

---

## 1. Demo Apps

### HogFlix (`~/Developer/hogflix`)

Already instrumented with `posthog-js`. Two bugs are planted:

1. **Movie titles not visible on cards** — `app/components/MovieCard.tsx:15`
   conditionally hides the title overlay behind `movie.posterUrl` which is always
   undefined for the 22 default movies.

2. **Checkout fails on mobile** — `app/account/page.tsx:118-130` calculates an
   animation duration via `300 / (scale - 1)` where `scale = window.innerWidth / rect.width`.
   On mobile single-column layout, `scale === 1`, causing division by zero →
   `"Checkout failed: unable to process plan change"`.

```bash
cd ~/Developer/hogflix
# Set your PostHog API key
echo 'NEXT_PUBLIC_POSTHOG_KEY=phc_YOUR_KEY_HERE' > .env.local
echo 'NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com' >> .env.local
pnpm install
pnpm dev  # runs on localhost:3000
```

**Pre-demo warmup**: Log in as any user (password: `hedgehog`), browse around,
click Play on a few movies, try upgrading a plan on a narrow window to trigger
the checkout error. This generates session recordings + error events for the
signals pipeline.

### OnlyHogs (`~/Developer/onlyhogs`)

Instrumented with `posthog-js`. This is the "wrong tab" gag in the script.

```bash
cd ~/Developer/onlyhogs
echo 'NEXT_PUBLIC_POSTHOG_KEY=phc_YOUR_KEY_HERE' > .env.local
echo 'NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com' >> .env.local
pnpm install
pnpm dev --port 3001  # different port from HogFlix
```

---

## 2. PostHog Backend Configuration

### 2a. Organization-level

```python
# Django shell or admin
from posthog.models import Organization
org = Organization.objects.get(id=YOUR_ORG_ID)
org.is_ai_data_processing_approved = True
org.save(update_fields=["is_ai_data_processing_approved"])
```

### 2b. Signal source configs

Enable signal sources for your team so the pipeline can process signals:

```bash
# Enable error tracking signals
curl -X POST "https://us.posthog.com/api/projects/$TEAM_ID/signals/source_configs/" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_product": "error_tracking", "source_type": "issue_created", "enabled": true}'

# Enable session replay signals
curl -X POST "https://us.posthog.com/api/projects/$TEAM_ID/signals/source_configs/" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_product": "session_replay", "source_type": "session_analysis_cluster", "enabled": true}'

# Enable GitHub issue signals (if GitHub integration is connected)
curl -X POST "https://us.posthog.com/api/projects/$TEAM_ID/signals/source_configs/" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_product": "github", "source_type": "issue", "enabled": true}'
```

### 2c. User autonomy config (for auto-start)

```bash
curl -X POST "https://us.posthog.com/api/users/@me/signal_autonomy/" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"autostart_priority": "P0"}'
```

---

## 3. Seed Signal Reports for Inbox

Five pre-built report fixtures are in `demo/signal-reports/`. They use the
`ingest_report_json` management command which creates fully-formed reports
in READY status with all artefacts.

```bash
cd ~/Developer/posthog

# Ingest all 5 reports
for f in ~/Developer/code/demo/signal-reports/*.json; do
  python manage.py ingest_report_json "$f" \
    --team-id $TEAM_ID \
    --repository PostHog/hogflix
  echo "---"
done
```

**Reports created:**

| # | Title | Priority | Actionability | Demo use |
|---|-------|----------|---------------|----------|
| 01 | Movie titles not visible on poster cards | P1 | Immediately actionable | Main "Create PR" flow |
| 02 | Plan upgrade crashes on mobile viewports | P0 | Immediately actionable | "Checkout broken" notification |
| 03 | Video player close button hidden behind navbar | P3 | Immediately actionable | "Known issue" to suppress |
| 04 | Search has no feedback for partial matches | P2 | Requires human input | "Needs input" research task |
| 05 | No movies have trailers configured | — | Not actionable | Background filler |

### Post-import: Set one report to PENDING_INPUT status

The `ingest_report_json` command creates all reports as READY. For the demo
script's "needs input" scenario, manually transition report #04:

```python
# Django shell
from products.signals.backend.models import SignalReport
report = SignalReport.objects.filter(
    title__icontains="Search has no feedback"
).first()
if report:
    fields = report.transition_to(
        SignalReport.Status.PENDING_INPUT,
        error="Repository selection required: multiple candidate repos detected"
    )
    report.save(update_fields=fields)
    print(f"Report {report.id} → pending_input")
```

---

## 4. Ungate the Inbox

The current branch (`posthog-code/gate-inbox-for-large-customers`) has
work-in-progress gating changes that need to be addressed for the demo:

**Current state of the working tree:**
- `InboxView.tsx`: `isGatedDueToScale = true` but the conditional rendering is
  removed — it always renders `<InboxSignalsTab />` directly, so the gate is
  effectively bypassed.
- `InboxSignalsTab.tsx`: `showTwoPaneLayout` replaced with `false`, forcing the
  single-pane layout. The empty state overlay always shows `WarmingUpPane`
  (not the Welcome pane). **This means reports won't be visible even if they
  exist in the DB** — the two-pane layout with the report list is disabled.
- `InboxEmptyStates.tsx`: `enabledProducts` is hardcoded, copy is updated.

**For the demo, you need the inbox to show actual reports.** Options:

**Option A — Record from `main` branch** (cleanest):
Stash or commit these gating changes, switch to `main`, and build PostHog Code
from there. The inbox will use the feature flag normally — set
`inbox-gated-due-to-scale` to `false` for your user in PostHog Cloud.

**Option B — Revert the `showTwoPaneLayout` override:**
```bash
# In InboxSignalsTab.tsx, change `{false ?` back to `{showTwoPaneLayout ?`
# This re-enables the report list when reports exist
```

**Option C — Record the "warming up" state as part of the flow:**
If the demo script intends to show the inbox initially warming up and then
reports appearing, the current state could work — but you'd need to reload
after the seed data is ingested.

---

## 5. GitHub Integration

Needed for: PR creation, suggested reviewers, repo selection in reports.

1. **Connect GitHub** in PostHog Cloud settings → Integrations → GitHub
2. **Grant access** to the `PostHog/hogflix` and `PostHog/onlyhogs` repos
3. **Verify:** The agent should be able to create branches and PRs against these repos

### Stage a PR for the "stamp my PR" scenario

The script calls for reviewing PR #2847 (onboarding flow refactor). Either:
- Create a real PR in one of your repos with a meaningful diff
- Or use any existing open PR and adjust the script number

```bash
# Example: create a dummy PR in hogflix
cd ~/Developer/hogflix
git checkout -b refactor/onboarding-flow
# ... make some changes ...
git commit -m "refactor: simplify onboarding flow"
git push -u origin refactor/onboarding-flow
gh pr create --title "refactor: simplify onboarding flow" --body "Streamlines the user onboarding experience"
# Note the PR number for the demo script
```

---

## 6. MCP Integrations

### PostHog MCP

Install the PostHog MCP server so agents can query product data (notebooks,
insights, session recordings) during the demo.

1. In PostHog Code → Settings → MCP Servers
2. Install the **PostHog** MCP server
3. Authorize with your PostHog account
4. Approve relevant tools (execute-sql, query-run, etc.)

### Linear MCP

For the "pull other data sources" demo moment:

1. In PostHog Code → Settings → MCP Servers
2. Install the **Linear** MCP server
3. Authorize with your Linear account
4. Approve relevant tools

### Notebook for "Cleo's data"

The script references: "Cleo created a notebook with the relevant user data."

1. In PostHog Cloud, create a notebook titled something like
   "Suggestion algorithm — user engagement data"
2. Add some realistic content: a trends chart, a funnel, some user cohort data
3. The PostHog MCP should be able to surface this notebook when the agent
   asks about it

---

## 7. Cloud Runner Infrastructure

For "Create PR" from signal reports and cloud task execution:

- Cloud task runner must be running and reachable
- SSE streaming endpoint must be functional
- The PostHog Code app must be connected to your PostHog project

**Verify**: Create a test cloud task from PostHog Code and confirm it runs and
streams events back.

---

## 8. PostHog Code App Configuration

### Desktop notifications
Enable in PostHog Code settings:
- Desktop notifications: ON
- Dock badge: ON
- Completion sound: ON (optional, adds polish)

### Harness/model setup
Make sure both harnesses are available:
- **Claude** (with latest Opus model)
- **Codex** (for the "switch to Codex" demo moment)

### Feature flag
Ensure `inbox-gated-due-to-scale` evaluates to `false` for your user.

---

## 9. Pre-Recording Dry Run Checklist

- [ ] HogFlix running on `localhost:3000` with PostHog SDK sending data
- [ ] OnlyHogs running on `localhost:3001` with PostHog SDK sending data
- [ ] Inbox shows 5+ signal reports with various statuses/priorities
- [ ] Report #01 (movie titles) is clearly the top actionable item
- [ ] Report #04 (search UX) shows as "Needs input"
- [ ] "Create PR" flow works from a signal report → cloud run → completion
- [ ] GitHub integration can create branches and PRs in hogflix repo
- [ ] PostHog MCP is installed and agent can query project data
- [ ] Linear MCP is installed (if using Linear demo moment)
- [ ] A notebook exists for the "Cleo's data" scene
- [ ] A staged PR exists for the "stamp my PR" scene
- [ ] Desktop notifications fire when a task completes
- [ ] Command Center shows multiple tasks in a grid
- [ ] "Suppress" works on a report (use the z-index one)
- [ ] Switching harness (Claude ↔ Codex) works
- [ ] Switching models works
- [ ] Plan mode vs auto mode switching works

---

## 10. "Dopamine Mode"

The script references "dopamine mode" with "seizure rainbow colors and music."
This may need to be built as a fun Easter egg in PostHog Code, or it could be a
post-production video effect. Confirm with the video team whether this is an
in-app feature or a video edit.

---

## Questions / Decisions Needed

1. **Inbox branch state**: The current branch has WIP gating changes that
   disable the report list in the Inbox (two-pane layout forced to `false`).
   Will you record the demo from `main` (where the inbox works normally with
   a feature flag), or should I revert the `showTwoPaneLayout` override on
   this branch?

2. **PostHog project**: Which PostHog Cloud project/team will be used for the
   demo? Need the team ID and API key for all the setup steps above.

2. **GitHub repos**: Are `PostHog/hogflix` and `PostHog/onlyhogs` already
   created as repos in the PostHog GitHub org, or do they need to be pushed?
   The agent needs to create branches/PRs against real GitHub repos.

3. **Staged PR number**: The script references PR #2847. What repo and what
   kind of change should this be? It needs to look like an "onboarding flow
   refactor" that a colleague asks you to review.

4. **"Cleo" notebook**: What realistic product data should be in the notebook?
   Suggestion algorithm metrics, user engagement funnels, retention cohorts?

5. **Slack notification**: The script has a Slack message from a colleague
   asking to stamp a PR. Is this a real Slack message you'll stage, or a
   mock-up in the video?

6. **Dopamine mode**: Is this a real feature to build in PostHog Code, or a
   video post-production effect?

7. **Cloud runner access**: Is the cloud task runner infrastructure available
   for your demo project? This is needed for the "Create PR" from signal
   report flow.

8. **HogFlix as PostHog org repo**: The signal reports reference
   `PostHog/hogflix` as the repository. The agent will try to clone this repo
   and work on it. Make sure the hogflix repo is pushed to `PostHog/hogflix`
   on GitHub with the bugs in place (including PostHog instrumentation).

9. **OnlyHogs port**: The script's "wrong tab" gag needs OnlyHogs open in a
   browser tab. Run it on port 3001 to avoid conflicts with HogFlix.

10. **Error tracking backfill timing**: After setting up PostHog SDK in
    HogFlix and triggering errors, the error tracking pipeline needs time
    to create `ErrorTrackingIssue` records. For the demo, the pre-built
    signal report fixtures bypass this — but if you want live error tracking
    signals flowing into the Inbox, trigger errors at least 30 minutes
    before recording.
