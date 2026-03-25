import type { AutomationRepository } from "../../db/repositories/automation-repository";
import { logger } from "../../utils/logger";

const log = logger.scope("automation-seed");

interface SeedAutomation {
  name: string;
  prompt: string;
  templateId: string;
  repoPath: string;
  scheduleTime: string;
}

const DEMO_AUTOMATIONS: SeedAutomation[] = [
  {
    name: "PR Review Digest",
    prompt:
      "Check the GitHub pull requests for this repository. Summarize which PRs need review, which are stale, and any that have merge conflicts.",
    templateId: "pr-review-digest",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "09:00",
  },
  {
    name: "Error Spike Alert",
    prompt:
      "Check error tracking for any new error spikes or regressions in the last 24 hours.",
    templateId: "error-spike-alert",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "08:00",
  },
  {
    name: "Slack Channel Digest",
    prompt:
      "Summarize key messages from important Slack channels since I last checked.",
    templateId: "slack-channel-digest",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "09:00",
  },
  {
    name: "Support Queue Triage",
    prompt:
      "Review all open support tickets. Prioritize by urgency, VIP status, and SLA.",
    templateId: "support-queue-triage",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "08:30",
  },
  {
    name: "Weekly Product Metrics",
    prompt:
      "Compile a weekly product metrics brief from PostHog.",
    templateId: "weekly-product-metrics",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "09:00",
  },
  {
    name: "Funnel Health Check",
    prompt:
      "Analyze the full growth funnel: visitor to signup to activation to conversion.",
    templateId: "funnel-health-check",
    repoPath: "/Users/demo/code/acme-app",
    scheduleTime: "07:00",
  },
];

/**
 * Demo outputs keyed by templateId. Used by both seed and triggerAll.
 *
 * FORMAT: Each output uses "---" as a separator between the AI summary
 * (shown in grid cells) and the full detailed report (shown when expanded).
 * The summary is the part before "---", the full output is the entire string.
 */
export const DEMO_OUTPUTS: Record<string, string[]> = {
  "pr-review-digest": [
    `**3 PRs need action today.** [#482](https://github.com/acme/app/pull/482) (auth refactor, 847 lines) is blocking the security sprint and has waited 2 days for your review. Two stale PRs should be closed. Two approved PRs ([#488](https://github.com/acme/app/pull/488), [#486](https://github.com/acme/app/pull/486)) can be merged immediately.

---

I scanned 47 open PRs across 3 repositories and 214 review comments from the last 24 hours. After filtering out routine approvals, bot-generated PRs, and docs-only changes, here's what requires your attention:

## Action Required

**[#482 — Auth refactor: migrate to JWT tokens](https://github.com/acme/app/pull/482)** — This PR has been open for 2 days and is **blocking the security sprint**. 847 lines across 23 files. @sarah is waiting on your review. The migration touches session management and every API route handler — if this slips past Wednesday, the security milestone moves to next quarter.

**[#465 — Update dependencies](https://github.com/acme/app/pull/465)** has merge conflicts in \`package-lock.json\` and \`tsconfig.json\` introduced by yesterday's merge. Needs a rebase before it can proceed — 5 minutes of work but it's been sitting for 3 days.

## Critical: Stale Work

[#471 — Dashboard redesign v2](https://github.com/acme/app/pull/471) has had **zero activity for 5 days**. @sarah asked a question about the design spec that was never answered. This is either abandoned or blocked — either close it or unblock the author today. Similarly [#468 — GraphQL gateway](https://github.com/acme/app/pull/468) has been idle 8 days and should be closed.

## Ship Now

[#488](https://github.com/acme/app/pull/488) (timezone fix) and [#486](https://github.com/acme/app/pull/486) (API docs) both have full approvals, all checks green. Merge them immediately — no reason for these to be sitting.`,
  ],
  "error-spike-alert": [
    `**CRITICAL: Hotfix needed today.** A \`TypeError\` in \`/api/users/profile\` is hitting 847 users and climbing — caused by [deploy #1847](https://github.com/acme/app/actions/runs/1847) 6 hours ago. Users can't view their profile page. A separate timeout issue in report generation (134 occurrences) can wait for next sprint.

---

I pulled error data from PostHog error tracking and cross-referenced against the deploy log and incident timeline. Scanned 12,847 error events across 342 unique error groups in the last 24 hours. Most are within normal baselines. Two are not:

## CRITICAL — Action Required Now

**\`TypeError: Cannot read property 'id' of undefined\`** in \`/api/users/profile\` — [847 occurrences](https://app.posthog.com/errors/group/e8f2a), **312 users affected**, rate is still climbing. This started 6 hours ago immediately after [deploy #1847](https://github.com/acme/app/actions/runs/1847). Users hitting this error cannot view their profile page at all. The stack trace points to \`UserProfileController.getProfile()\` line 42 — the \`user.organization\` relationship is returning null for users without an org, and the code assumes it always exists. **Hotfix today — this is breaking core UX.**

## Investigate This Week

\`TimeoutError: Request timed out after 30000ms\` in \`/api/reports/generate\` — [134 occurrences](https://app.posthog.com/errors/group/f9a1b), 89 users. Not caused by new code — report sizes have been growing and are now hitting the 30s timeout ~15% of the time on large exports. Needs pagination or background processing but isn't urgent.

## Resolved — No Action Needed

The \`NullPointerException\` in the billing module flagged yesterday has dropped to zero errors since [PR #476](https://github.com/acme/app/pull/476) was merged. The Stripe 429 rate limit errors are up 12% but still within acceptable bounds — just monitor for now.`,
  ],
  "slack-channel-digest": [
    `**@sarah is blocked on you** — needs the auth migration timeline to write customer comms (unanswered 6 hours). The team decided to switch to **weekly deploys starting Monday** — ship anything urgent by Friday. @mike says the **DB migration is 2 weeks behind** which threatens the Q2 infra milestone.

---

I read 847 messages across 12 Slack channels from the last 12 hours. Filtered out reactions, social chat, bot notifications, and threads that resolved without action needed. Here's what actually matters to the business:

## You Need to Respond

**@sarah is blocked on you** — she asked about the auth migration timeline in [#product](https://acme.slack.com/archives/C02/p1711234890) and cannot write the customer communication email until she has a date. This has been unanswered for 6 hours. Reply today.

## Decisions Made (FYI)

The team agreed in #engineering to **switch to weekly deploys starting next Monday**. @sarah is updating the CI pipeline. This changes the release cadence — if you have anything that needs to ship before then, get it merged by Friday.

## Business-Critical Information

@mike flagged that the **database migration will take 2 weeks longer than planned** due to data volume. This could push the Q2 infrastructure milestone. Needs PM decision on whether to descope or accept the delay.

[Incident #42](https://acme.pagerduty.com/incidents/42) (API latency spike) was resolved at 03:15 UTC — root cause was connection pool exhaustion from a runaway background job. Post-mortem is Thursday 2pm.

## Ignored

Filtered out: 4 messages about team lunch, 2 conference talk announcements, 180+ bot notifications, ~600 messages in social/random channels, and 47 resolved support threads.`,
  ],
  "support-queue-triage": [
    `**3 urgent tickets, 2 SLA breaches imminent.** Acme Corp ($48k ARR, P1) has a completely broken data sync — escalate to engineering now, they have a board meeting tomorrow. DataFlow LLC was double-charged $2,400 and SLA breaches in 1 hour — process refund immediately. TechStart Inc (12 users) locked out after bulk password reset.

---

I pulled all open tickets from Zendesk, cross-referenced customer data against Stripe billing and PostHog usage, and checked SLA timers. 18 tickets total — the vast majority are routine. Three need immediate action:

## CRITICAL — Revenue at Risk

**Acme Corp ($48k ARR) — data sync completely broken** ([#8842](https://acme.zendesk.com/agent/tickets/8842), P1, 2 hours old). Their pipeline integration stopped syncing 4 hours ago and their real-time dashboards are down. They're getting 503 errors. This is almost certainly related to last night's connection pool incident. **Escalate to engineering immediately** — this is our 3rd largest customer and they have a board meeting tomorrow that depends on this data.

**DataFlow LLC — charged twice, $2,400 overcharge** ([#8838](https://acme.zendesk.com/agent/tickets/8838), P2, 5 hours old). **SLA breach in 1 hour.** Verify the duplicate charge in Stripe, process the refund now, and send a personal apology. Check if this is a one-off or if the March billing run had a systemic issue affecting other accounts.

**TechStart Inc — entire team of 12 locked out** ([#8840](https://acme.zendesk.com/agent/tickets/8840), P2, 3 hours old). They used bulk password reset and now get "Invalid session" errors. Likely the JWT migration bug. Their sessions may need manual invalidation.

## SLA Breach Imminent

Ticket #8835 (SSO config) breaches in 55 minutes — assign to @support-sarah. Ticket #8831 (rate limit questions) breaches in 2 hours — use the standard template.

## Pattern Worth Noting

5 SSO tickets today, all about SAML setup. Our docs are probably outdated after the recent IdP provider changes. A [KB article update](https://help.acme.com/sso-setup) would eliminate these.

## Ignored

Filtered out 8 low-priority tickets: 3 feature requests (logged to Linear), 2 general "how do I" questions (pointed to docs), 3 billing proration questions (standard responses sent).`,
  ],
  "weekly-product-metrics": [
    `**Two actions needed.** Roll out the ['new-dashboard'](https://app.posthog.com/feature_flags/42) feature flag to 100% — the experiment hit significance with a **12% engagement lift**. Enterprise trial pipeline is declining for the second straight week (3 vs avg 6) — flag to sales before it impacts Q2. Overall metrics are strong: WAU +8%, activation +4pp, MRR $287k (+2.2%).

---

I queried PostHog for all key product metrics, compared against last week and 4-week averages, and flagged anything that moved more than expected. Most metrics are healthy or improving. Here's what actually needs attention:

## Action Required

**Roll out 'new-dashboard' to 100% now.** The [feature flag experiment](https://app.posthog.com/feature_flags/42) has hit statistical significance with a **12% lift in engagement** (n=2,400, p<0.01). There's no reason to keep this gated — every day at 50% rollout means half your users are getting a worse experience.

**Enterprise pipeline is drying up** — only 3 new enterprise trials this week vs 7 last week and a 4-week average of 6. This is the second consecutive week of decline. Raise with sales leadership — if this continues through April it will impact Q2 revenue targets.

## Investigate

**[D7 retention](https://app.posthog.com/insights/retention) flat at 42%** despite activation improving from 34% to 38%. This is counterintuitive — more users are activating but they're not sticking around longer. The new activated users may be lower-intent. Worth digging into what activated users do in their second week vs what retained users do.

**Mobile web bounce rate up 5pp to 34%.** LCP measured at 2.1s on mobile — significantly above the 1.5s target. This is slowly getting worse each week. Needs a performance sprint.

## Good News (No Action Needed)

WAU up 8% to 12,340. Signups up 8.5%. Activation rate jumped 4pp (biggest single-week improvement this quarter) thanks to the onboarding fix. MRR at $287,400 (+2.2%). Error rate down. Latency down 10%.

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| WAU | 12,340 | 11,430 | **+8.0%** |
| Activation | 38% | 34% | **+4pp** |
| D7 Retention | 42% | 42% | flat |
| MRR | $287,400 | $281,200 | +2.2% |
| Error Rate | 0.8% | 0.9% | -0.1pp |`,
  ],
  "funnel-health-check": [
    `**One clear bottleneck: Step 4 (invite team) has 35% drop-off** and hasn't improved in 4 weeks — fixing this could add ~130 activated users/week. Conversion to paid is flat at 26.2% despite better activation, suggesting the paywall needs work. Good news: the onboarding step 3 fix is confirmed working with activation up 4pp to 38.2%.

---

I analyzed the full growth funnel in PostHog — 24,500 visitors through to D30 retention — and compared each stage against last week and the 4-week trend. Most of the funnel is healthy or improving. One stage is the clear bottleneck:

## Action Required

**Step 4 (invite team members) has a 35% drop-off and hasn't improved in 4 weeks.** This is now the single biggest leak in the funnel after the onboarding step 3 fix shipped. Free-tier users are hesitant to invite teammates — they don't want to commit before seeing value. Consider adding a "try with sample data" option that lets them experience the collaborative features without inviting real people. This one fix could add ~130 additional activated users per week based on current volume.

**Conversion rate (activated → paid) flat at 26.2% despite activation improving 4pp.** The new users entering the paid funnel may be lower-intent — they're activating faster (median 31 min, down from 47) but aren't converting at a higher rate. The [paywall experience](https://app.posthog.com/insights/funnel/paywall) shows users see the paywall 2.3 times before converting, with the most common trigger being the free-tier event limit. Consider whether the limit is set correctly.

## What's Working (No Action Needed)

The [onboarding step 3 fix](https://github.com/acme/app/pull/481) is confirmed working — abandonment dropped from 45% to 38%, activation rate up 4pp to 38.2%. This is the biggest single-week funnel improvement this quarter. Signup conversion also ticked up 0.3pp from the pricing page A/B test (p=0.04).

## Full Funnel Numbers

\`\`\`
Visitors     Signups      Activated    Converted    Retained D30
24,500  →    890 (3.6%)   340 (38.2%)  89 (26.2%)   25 (28.1%)
+12%         +8.5%        +4pp         flat          +1pp
\`\`\`

The funnel is getting wider at the top (more traffic, better signup rate) and the middle is improving (activation). The bottlenecks are now at step 4 and the free-to-paid transition.`,
  ],
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function seedExampleData(repo: AutomationRepository): void {
  const existing = repo.findAll();
  if (existing.length > 0) {
    log.info("Automations already exist, skipping seed", {
      count: existing.length,
    });
    return;
  }

  log.info("Seeding example automation data");

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  for (const seed of DEMO_AUTOMATIONS) {
    const automation = repo.create({
      name: seed.name,
      prompt: seed.prompt,
      templateId: seed.templateId,
      repoPath: seed.repoPath,
      scheduleTime: seed.scheduleTime,
      timezone: tz,
      enabled: true,
    });

    const outputs = DEMO_OUTPUTS[seed.templateId] ?? [];
    const runCount = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < runCount; i++) {
      const hours = (runCount - i) * 8 + Math.floor(Math.random() * 4);
      const isFailed = i === 0 && Math.random() < 0.2;

      const run = repo.createRun(automation.id);
      // Backdate the run
      const startedAt = hoursAgo(hours);
      const completedAt = hoursAgo(hours - 0.05);

      if (isFailed) {
        repo.completeRun(run.id, "failed", undefined, "Auth token expired — could not connect to GitHub. Please re-authenticate in Settings > Integrations.");
      } else {
        repo.completeRun(run.id, "success", pickRandom(outputs));
      }

      // Manually update timestamps for realism
      repo.updateRunTimestamps(run.id, startedAt, completedAt);
    }

    // Update automation's lastRun fields
    const runs = repo.findRunsByAutomationId(automation.id, 1);
    if (runs.length > 0) {
      const lastRun = runs[0];
      repo.updateLastRun(
        automation.id,
        lastRun.status as "success" | "failed",
        lastRun.status === "failed" ? { error: lastRun.error ?? undefined } : undefined,
      );
    }
  }

  log.info("Seeded example automation data", {
    automations: DEMO_AUTOMATIONS.length,
  });
}
