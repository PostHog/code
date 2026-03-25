import type { AutomationTemplate } from "@shared/types/automations";

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Engineering (18) ───────────────────────────────────────────────
  {
    id: "pr-review-digest",
    name: "PR Review Digest",
    description:
      "Summarize open pull requests needing review, stale PRs, and merge conflicts.",
    category: "Engineering",
    tags: ["github", "prs", "review", "digest"],
    mcps: ["GitHub"],
    recommended: true,
    prompt:
      "Check the GitHub pull requests for this repository. Summarize which PRs need review, which are stale (no activity in 3+ days), and any that have merge conflicts. Call out anything blocking a merge.",
  },
  {
    id: "ci-failure-triage",
    name: "CI Failure Triage",
    description:
      "Check recent CI failures, group by root cause, and suggest fixes.",
    category: "Engineering",
    tags: ["github", "ci", "triage"],
    mcps: ["GitHub"],
    prompt:
      "Review recent CI/CD failures on GitHub Actions for this repository. Group failures by root cause (flaky tests, dependency issues, config problems, genuine bugs). For each group, suggest the most likely fix.",
  },
  {
    id: "error-spike-alert",
    name: "Error Spike Alert",
    description:
      "Monitor error rates and flag new spikes or regressions since the last deploy.",
    category: "Engineering",
    tags: ["posthog", "sentry", "errors", "monitoring"],
    mcps: ["PostHog", "Sentry"],
    recommended: true,
    prompt:
      "Check error tracking for any new error spikes or regressions in the last 24 hours. Compare current error rates to the previous period. Flag any new error groups, significant increases in existing errors, and correlate with recent deployments if possible.",
  },
  {
    id: "dependency-vulnerability-scan",
    name: "Dependency Vulnerability Scan",
    description:
      "Check for outdated or vulnerable dependencies and summarize what needs updating.",
    category: "Engineering",
    tags: ["github", "security", "dependencies"],
    mcps: ["GitHub"],
    prompt:
      "Check this repository for known dependency vulnerabilities and outdated packages. List critical and high-severity issues first, with links to advisories. Suggest which updates are safe to apply immediately vs which need careful testing.",
  },
  {
    id: "deploy-readiness-check",
    name: "Deploy Readiness Check",
    description:
      "Assess open PRs, CI status, and error rates to determine if it's safe to deploy.",
    category: "Engineering",
    tags: ["github", "posthog", "deploy", "readiness"],
    mcps: ["GitHub", "PostHog", "Sentry"],
    prompt:
      "Assess whether it's safe to deploy right now. Check: (1) Are all CI checks passing on the main branch? (2) Are there any open PRs that should go out first? (3) Are error rates stable or trending down? (4) Any recent incidents still being investigated? Give a clear go/no-go recommendation with reasons.",
  },
  {
    id: "code-review-followup",
    name: "Code Review Follow-up",
    description: "Find PRs where reviewer comments haven't been addressed yet.",
    category: "Engineering",
    tags: ["github", "review", "followup"],
    mcps: ["GitHub"],
    prompt:
      "Check my open pull requests on GitHub and find any where reviewers left comments or requested changes that I haven't addressed yet. List each PR with the pending feedback and how old it is.",
  },
  {
    id: "sprint-progress-update",
    name: "Sprint Progress Update",
    description:
      "Summarize current sprint or cycle progress from Linear or GitHub issues.",
    category: "Engineering",
    tags: ["linear", "github", "sprint", "progress"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Summarize the current sprint or cycle progress. How many issues are done vs in-progress vs not started? Flag any that are at risk of not completing this sprint. List blockers and who's responsible for resolving them.",
  },
  {
    id: "tech-debt-prioritizer",
    name: "Tech Debt Prioritizer",
    description: "Review tech debt issues and rank them by impact and effort.",
    category: "Engineering",
    tags: ["linear", "github", "tech-debt", "prioritization"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Review issues tagged as tech debt, refactoring, or improvement in our issue tracker. Rank the top 10 by estimated impact (how much it slows the team) vs effort (how long to fix). Recommend which 2-3 would give the best ROI to tackle this sprint.",
  },
  {
    id: "stale-branch-cleanup",
    name: "Stale Branch Cleanup",
    description:
      "Find branches with no recent activity and suggest which to delete.",
    category: "Engineering",
    tags: ["github", "cleanup", "branches"],
    mcps: ["GitHub"],
    prompt:
      "List all branches in this repository that have had no commits in the last 30 days. For each, show the last commit date and author. Flag any that appear to be abandoned feature branches vs long-lived branches that should be kept.",
  },
  {
    id: "release-notes-drafter",
    name: "Release Notes Drafter",
    description:
      "Compile merged PRs since the last release into draft release notes.",
    category: "Engineering",
    tags: ["github", "release", "notes"],
    mcps: ["GitHub"],
    prompt:
      "Look at all PRs merged since the last tagged release in this repository. Group them into categories (features, bug fixes, improvements, breaking changes) and draft release notes in markdown format. Include PR numbers and authors.",
  },
  {
    id: "on-call-handoff-summary",
    name: "On-Call Handoff Summary",
    description:
      "Summarize incidents, alerts, and open issues for on-call handoff.",
    category: "Engineering",
    tags: ["pagerduty", "sentry", "slack", "on-call"],
    mcps: ["PagerDuty", "Sentry", "Slack"],
    prompt:
      "Prepare an on-call handoff summary. Include: (1) Active incidents and their current status, (2) Alerts that fired in the last shift, (3) Any open issues or known problems to watch, (4) Recent deployments that might cause issues. Format as a clear handoff document.",
  },
  {
    id: "flaky-test-detector",
    name: "Flaky Test Detector",
    description:
      "Identify tests that have failed intermittently in recent CI runs.",
    category: "Engineering",
    tags: ["github", "ci", "tests", "flaky"],
    mcps: ["GitHub"],
    prompt:
      "Analyze recent CI runs and identify tests that have failed intermittently (passed on retry or failed in some runs but not others). List the flakiest tests, how often they fail, and any patterns (time of day, specific runners, etc.).",
  },
  {
    id: "merge-conflict-monitor",
    name: "Merge Conflict Monitor",
    description: "Check open PRs for merge conflicts that need resolution.",
    category: "Engineering",
    tags: ["github", "merge", "conflicts"],
    mcps: ["GitHub"],
    prompt:
      "Check all open pull requests for merge conflicts with the main branch. List each conflicting PR with its author, how long it's been open, and the conflicting files. Prioritize by PR age and importance.",
  },
  {
    id: "security-advisory-digest",
    name: "Security Advisory Digest",
    description:
      "Check for new security advisories affecting project dependencies.",
    category: "Engineering",
    tags: ["github", "security", "advisories"],
    mcps: ["GitHub"],
    prompt:
      "Check for any new security advisories or Dependabot alerts affecting this repository's dependencies. Summarize severity, affected packages, and whether patches are available. Prioritize by severity and exploitability.",
  },
  {
    id: "jira-sprint-review",
    name: "Jira Sprint Review",
    description:
      "Summarize Jira sprint progress, blockers, and carryover items.",
    category: "Engineering",
    tags: ["atlassian", "jira", "sprint"],
    mcps: ["Atlassian"],
    prompt:
      "Review the current Jira sprint. Summarize: issues completed vs remaining, any blockers, items at risk of carryover, and team capacity usage. Highlight anything that needs attention before sprint end.",
  },
  {
    id: "confluence-doc-staleness",
    name: "Confluence Doc Staleness Check",
    description: "Find Confluence pages that are outdated or need review.",
    category: "Engineering",
    tags: ["atlassian", "confluence", "docs", "cleanup"],
    mcps: ["Atlassian"],
    prompt:
      "Review our Confluence space and find pages that haven't been updated in 6+ months but are still linked or referenced. List the most important stale pages, their last editor, and suggest which should be updated, archived, or deleted.",
  },
  {
    id: "linear-cycle-health",
    name: "Linear Cycle Health",
    description: "Review Linear cycle progress and flag at-risk issues.",
    category: "Engineering",
    tags: ["linear", "cycle", "progress"],
    mcps: ["Linear"],
    prompt:
      "Check the current Linear cycle. What percentage of issues are complete? Which issues are still in backlog or unstarted but assigned to this cycle? Flag any that are blocked or at risk. Summarize the overall health of the cycle.",
  },
  {
    id: "monday-board-summary",
    name: "Monday Board Summary",
    description: "Summarize Monday.com board status and overdue items.",
    category: "Engineering",
    tags: ["monday", "board", "status"],
    mcps: ["Monday"],
    prompt:
      "Review the Monday.com boards and summarize: items by status (done, working, stuck), overdue items, and items with no assignee. Flag anything that needs immediate attention.",
  },

  // ─── Product (16) ──────────────────────────────────────────────────
  {
    id: "feature-adoption-tracker",
    name: "Feature Adoption Tracker",
    description:
      "Check adoption metrics for recently shipped features using PostHog.",
    category: "Product",
    tags: ["posthog", "features", "adoption", "metrics"],
    mcps: ["PostHog"],
    recommended: true,
    prompt:
      "Check PostHog for adoption metrics on features shipped in the last 2 weeks. For each feature, report: unique users, usage frequency, and retention (are people coming back to use it?). Flag any features with unexpectedly low adoption that might need attention.",
  },
  {
    id: "experiment-results-review",
    name: "Experiment Results Review",
    description:
      "Review running A/B tests and experiments, flag any ready to call.",
    category: "Product",
    tags: ["posthog", "experiments", "ab-tests"],
    mcps: ["PostHog"],
    recommended: true,
    prompt:
      "Review all running experiments and A/B tests in PostHog. For each: report the current sample size, statistical significance, and effect size. Flag any that have reached significance and are ready for a decision. Also flag any that have been running too long without reaching significance.",
  },
  {
    id: "weekly-product-metrics",
    name: "Weekly Product Metrics Brief",
    description:
      "Compile key product metrics into a weekly summary with trends.",
    category: "Product",
    tags: ["posthog", "metrics", "weekly", "summary"],
    mcps: ["PostHog"],
    prompt:
      "Compile a weekly product metrics brief from PostHog. Include: DAU/WAU/MAU, key conversion rates, feature usage trends, error rates, and page load performance. Compare each metric to last week and highlight anything that moved significantly (>10% change).",
  },
  {
    id: "feature-request-triage",
    name: "Feature Request Triage",
    description: "Review and categorize new feature requests from all sources.",
    category: "Product",
    tags: ["linear", "github", "intercom", "feature-requests", "triage"],
    mcps: ["Linear", "GitHub", "Intercom"],
    prompt:
      "Gather new feature requests from the last week across our issue tracker, support tickets, and feedback channels. Categorize each by theme, estimate relative demand (how many people asked), and flag any that align with current roadmap priorities. Suggest which 3 are most worth investigating.",
  },
  {
    id: "roadmap-status-update",
    name: "Roadmap Status Update",
    description:
      "Generate a status update on current roadmap items from project management tools.",
    category: "Product",
    tags: ["linear", "notion", "roadmap", "status"],
    mcps: ["Linear", "Notion"],
    prompt:
      "Generate a roadmap status update by checking current project and issue status in our project management tools. For each roadmap item: report current status (on track, at risk, blocked), key milestones hit this week, and any blockers. Format as a stakeholder-ready update.",
  },
  {
    id: "user-journey-analysis",
    name: "User Journey Analysis",
    description: "Analyze key user flows and conversion rates in PostHog.",
    category: "Product",
    tags: ["posthog", "funnels", "user-flows", "analysis"],
    mcps: ["PostHog"],
    prompt:
      "Analyze the key user journeys in PostHog: signup-to-activation, activation-to-retention, and the core product loop. Report conversion rates at each step, identify the biggest drop-off points, and compare to the previous week. Suggest where to focus optimization efforts.",
  },
  {
    id: "session-replay-review",
    name: "Session Replay Review",
    description: "Review recent session replays for usability issues and bugs.",
    category: "Product",
    tags: ["posthog", "session-replay", "ux"],
    mcps: ["PostHog"],
    prompt:
      "Review recent PostHog session replays, focusing on sessions where users encountered errors, rage-clicked, or abandoned key flows. Summarize the top usability issues observed, with specific examples. Prioritize by frequency and severity.",
  },
  {
    id: "survey-response-digest",
    name: "Survey Response Digest",
    description:
      "Summarize recent PostHog survey responses and highlight key themes.",
    category: "Product",
    tags: ["posthog", "surveys", "feedback"],
    mcps: ["PostHog"],
    prompt:
      "Review recent PostHog survey responses. Group feedback by theme, quantify sentiment (positive/negative/neutral), and highlight the most actionable insights. Call out any recurring complaints or particularly enthusiastic praise.",
  },
  {
    id: "feature-flag-audit",
    name: "Feature Flag Audit",
    description:
      "Review active feature flags and identify any that should be cleaned up.",
    category: "Product",
    tags: ["posthog", "feature-flags", "cleanup"],
    mcps: ["PostHog"],
    prompt:
      "Audit all active feature flags in PostHog. Identify: flags that have been at 100% rollout for 2+ weeks (ready to remove), flags with no recent evaluation (possibly dead code), and flags that have been in partial rollout for too long. Recommend which to clean up.",
  },
  {
    id: "activation-funnel-monitor",
    name: "Activation Funnel Monitor",
    description: "Track new user activation funnel and flag conversion drops.",
    category: "Product",
    tags: ["posthog", "activation", "funnel", "onboarding"],
    mcps: ["PostHog"],
    prompt:
      "Check the new user activation funnel in PostHog. Report conversion rates at each step of onboarding and activation. Compare to last week. Flag any steps where conversion dropped significantly and hypothesize potential causes.",
  },
  {
    id: "power-user-behavior-analysis",
    name: "Power User Behavior Analysis",
    description:
      "Identify patterns in how power users differ from average users.",
    category: "Product",
    tags: ["posthog", "cohorts", "power-users", "analysis"],
    mcps: ["PostHog"],
    prompt:
      "Using PostHog, compare the behavior of your top 10% most active users against the average. What features do power users use that others don't? How does their activation journey differ? Identify 2-3 behaviors that predict long-term retention.",
  },
  {
    id: "feature-usage-heatmap",
    name: "Feature Usage Heatmap",
    description: "Report which features are most and least used this week.",
    category: "Product",
    tags: ["posthog", "features", "usage", "heatmap"],
    mcps: ["PostHog"],
    prompt:
      "Generate a feature usage heatmap from PostHog showing which features got the most and least usage this week. Rank features by unique users and total events. Highlight any features with declining usage trends and any with growing adoption.",
  },
  {
    id: "user-retention-cohort-update",
    name: "User Retention Cohort Update",
    description: "Generate an updated retention cohort analysis.",
    category: "Product",
    tags: ["posthog", "retention", "cohorts"],
    mcps: ["PostHog"],
    prompt:
      "Generate a retention cohort analysis from PostHog for the last 8 weeks. Show week-over-week retention for each signup cohort. Identify whether retention is improving or declining over time, and flag any cohorts with notably different retention patterns.",
  },
  {
    id: "product-quality-scorecard",
    name: "Product Quality Scorecard",
    description:
      "Compile error rates, load times, and crash rates into a quality report.",
    category: "Product",
    tags: ["posthog", "sentry", "quality", "performance"],
    mcps: ["PostHog", "Sentry"],
    prompt:
      "Compile a product quality scorecard. Include: error rate trends, page load times (p50, p95), crash rates, and unhandled exception counts. Compare each metric to last week. Flag any quality regressions and identify the most impactful issues to fix.",
  },
  {
    id: "notion-product-spec-tracker",
    name: "Notion Product Spec Tracker",
    description:
      "Check product specs in Notion for completeness and staleness.",
    category: "Product",
    tags: ["notion", "specs", "docs"],
    mcps: ["Notion"],
    prompt:
      "Review product specification documents in Notion. Find specs that are incomplete (missing sections like success metrics, edge cases, or technical approach), specs for shipped features that weren't updated post-launch, and any specs older than 3 months that reference features still in development.",
  },
  {
    id: "competitor-mention-tracker",
    name: "Competitor Mention Tracker",
    description: "Find mentions of competitors in support and sales channels.",
    category: "Product",
    tags: ["slack", "intercom", "competitors"],
    mcps: ["Slack", "Intercom"],
    prompt:
      "Search recent support conversations and Slack channels for mentions of competitor products. Summarize: which competitors come up most, in what context (feature comparison, switching, praise), and any specific feature gaps customers mention. Group by theme.",
  },

  // ─── Growth (14) ───────────────────────────────────────────────────
  {
    id: "funnel-health-check",
    name: "Funnel Health Check",
    description:
      "Analyze signup, activation, and conversion funnels to flag drop-offs.",
    category: "Growth",
    tags: ["posthog", "funnels", "conversion", "growth"],
    mcps: ["PostHog"],
    recommended: true,
    prompt:
      "Analyze the full growth funnel in PostHog: visitor → signup → activation → conversion → retention. Report conversion rates at each stage, compare to last week, and identify the biggest drop-off point. Suggest the highest-leverage improvement to test.",
  },
  {
    id: "churn-risk-alert",
    name: "Churn Risk Alert",
    description:
      "Identify accounts showing signs of churn from usage patterns.",
    category: "Growth",
    tags: ["posthog", "stripe", "churn", "retention"],
    mcps: ["PostHog", "Stripe"],
    recommended: true,
    prompt:
      "Identify accounts at risk of churning by checking for: declining usage over the past 4 weeks, key features they stopped using, reduced login frequency, or payment failures. List the top 10 at-risk accounts with their warning signals and suggest intervention strategies.",
  },
  {
    id: "trial-conversion-monitor",
    name: "Trial Conversion Monitor",
    description:
      "Track trial-to-paid conversion rates and flag at-risk trials.",
    category: "Growth",
    tags: ["posthog", "stripe", "trials", "conversion"],
    mcps: ["PostHog", "Stripe"],
    prompt:
      "Review accounts currently in trial. Report: total active trials, conversion rate vs last month, trials expiring in the next 7 days, and which trial accounts are most engaged (likely to convert) vs least engaged (likely to churn). Suggest which at-risk trials to reach out to.",
  },
  {
    id: "signup-source-analysis",
    name: "Signup Source Analysis",
    description: "Break down where new signups are coming from this week.",
    category: "Growth",
    tags: ["posthog", "signups", "attribution"],
    mcps: ["PostHog"],
    prompt:
      "Break down this week's new signups by source: organic search, direct, referral, social, paid campaigns, etc. Compare volumes and conversion rates to last week. Identify which channels are growing, shrinking, or have unusually high/low quality signups.",
  },
  {
    id: "onboarding-completion-tracker",
    name: "Onboarding Completion Tracker",
    description:
      "Monitor onboarding step completion rates and flag bottlenecks.",
    category: "Growth",
    tags: ["posthog", "onboarding", "funnel"],
    mcps: ["PostHog"],
    prompt:
      "Check PostHog for onboarding funnel completion rates. For each onboarding step, report: completion rate, median time to complete, and drop-off rate. Flag any steps where completion dropped vs last week or where users seem to get stuck.",
  },
  {
    id: "pricing-page-analytics",
    name: "Pricing Page Analytics",
    description:
      "Analyze pricing page behavior, conversion, and plan selection patterns.",
    category: "Growth",
    tags: ["posthog", "pricing", "conversion"],
    mcps: ["PostHog"],
    prompt:
      "Analyze pricing page behavior in PostHog. Report: visit-to-signup conversion rate, which plans are most selected, how long users spend on the page, and whether users who compare plans convert better. Compare to last week and flag any notable changes.",
  },
  {
    id: "referral-program-monitor",
    name: "Referral Program Monitor",
    description: "Track referral signup rates and program effectiveness.",
    category: "Growth",
    tags: ["posthog", "stripe", "referrals"],
    mcps: ["PostHog", "Stripe"],
    prompt:
      "Check referral program metrics: new referral signups this week, referral conversion rate, top referrers, and revenue attributed to referrals. Compare to previous weeks and flag if referral quality or volume is declining.",
  },
  {
    id: "landing-page-performance",
    name: "Landing Page Performance",
    description: "Compare landing page variants and flag underperformers.",
    category: "Growth",
    tags: ["posthog", "landing-pages", "conversion"],
    mcps: ["PostHog"],
    prompt:
      "Review landing page performance in PostHog. For each key landing page: report bounce rate, time on page, and conversion rate. Compare variants if A/B tests are running. Flag pages with high traffic but low conversion as optimization opportunities.",
  },
  {
    id: "paywall-conversion-analysis",
    name: "Paywall Conversion Analysis",
    description: "Analyze free-to-paid conversion triggers and blockers.",
    category: "Growth",
    tags: ["posthog", "stripe", "paywall", "conversion"],
    mcps: ["PostHog", "Stripe"],
    prompt:
      "Analyze what triggers free users to upgrade to paid. Look at: which features they hit the paywall on, how many times they see the paywall before converting, and what the median time from first paywall hit to conversion is. Identify the top 3 conversion triggers.",
  },
  {
    id: "geographic-expansion-report",
    name: "Geographic Expansion Report",
    description:
      "Break down growth metrics by region and flag emerging markets.",
    category: "Growth",
    tags: ["posthog", "geography", "expansion"],
    mcps: ["PostHog"],
    prompt:
      "Break down signups, activation, and revenue by geographic region using PostHog. Identify which regions are growing fastest, which have the highest activation rates, and any regions with a lot of signups but low conversion. Suggest regions worth investing in.",
  },
  {
    id: "stripe-mrr-dashboard",
    name: "Stripe MRR Dashboard",
    description:
      "Compile MRR, churn rate, ARPU, and expansion revenue from Stripe.",
    category: "Growth",
    tags: ["stripe", "mrr", "revenue", "metrics"],
    mcps: ["Stripe", "PostHog"],
    prompt:
      "Pull key revenue metrics from Stripe: MRR, net new MRR, churn MRR, expansion MRR, ARPU, and paying customer count. Compare to last month. Highlight any trends in plan mix, upgrade/downgrade patterns, or payment failure rates.",
  },
  {
    id: "stripe-failed-payment-alert",
    name: "Stripe Failed Payment Alert",
    description: "Flag failed payments and expiring cards that need follow-up.",
    category: "Growth",
    tags: ["stripe", "payments", "churn-prevention"],
    mcps: ["Stripe"],
    prompt:
      "Check Stripe for: (1) Failed payments in the last 7 days — list the accounts, amounts, and failure reasons. (2) Cards expiring in the next 30 days with no backup payment method. (3) Accounts in dunning that haven't responded. Suggest follow-up actions for each.",
  },
  {
    id: "hubspot-lead-scoring-update",
    name: "HubSpot Lead Scoring Update",
    description:
      "Update lead scores in HubSpot based on product usage data from PostHog.",
    category: "Growth",
    tags: ["hubspot", "posthog", "leads", "scoring"],
    mcps: ["HubSpot", "PostHog"],
    prompt:
      "Cross-reference HubSpot leads with PostHog usage data. Identify leads that have become highly active in the product (strong buy signal) and leads that signed up but aren't engaging. Suggest which leads should be upgraded to sales-qualified based on their product behavior.",
  },
  {
    id: "shopify-store-metrics",
    name: "Shopify Store Metrics",
    description: "Review store conversion, cart abandonment, and top products.",
    category: "Growth",
    tags: ["shopify", "posthog", "ecommerce"],
    mcps: ["Shopify", "PostHog"],
    prompt:
      "Review Shopify store metrics: conversion rate, average order value, cart abandonment rate, and top-selling products this week. Compare to last week. Flag products with declining sales or pages with high bounce rates.",
  },

  // ─── Support (14) ──────────────────────────────────────────────────
  {
    id: "support-queue-triage",
    name: "Support Queue Triage",
    description: "Prioritize open support tickets, flag urgent and VIP issues.",
    category: "Support",
    tags: ["zendesk", "intercom", "tickets", "triage"],
    mcps: ["Zendesk", "Intercom"],
    recommended: true,
    prompt:
      "Review all open support tickets. Prioritize by: (1) Urgency — any P0/P1 issues or customers experiencing outages, (2) VIP — tickets from enterprise or high-value accounts, (3) Age — tickets approaching SLA breach. Give me a prioritized list of the top 10 tickets to handle first with brief context for each.",
  },
  {
    id: "bug-report-digest",
    name: "Bug Report Digest",
    description:
      "Summarize new bug reports and link them to related engineering issues.",
    category: "Support",
    tags: ["zendesk", "github", "linear", "bugs"],
    mcps: ["Zendesk", "GitHub", "Linear"],
    prompt:
      "Gather new bug reports from the last 24 hours across support tickets. For each: summarize the issue, identify affected users/accounts, and check if there's already a related engineering issue in the tracker. Group related reports together. Flag any that affect multiple customers.",
  },
  {
    id: "customer-health-check",
    name: "Customer Health Check",
    description:
      "Review key account usage patterns and flag accounts needing attention.",
    category: "Support",
    tags: ["posthog", "zendesk", "stripe", "customer-health"],
    mcps: ["PostHog", "Zendesk", "Stripe"],
    prompt:
      "Check the health of our top 20 accounts. For each, assess: product usage trends (up/down/flat), open support tickets, payment status, and any recent negative signals (errors, declined payments, reduced usage). Flag accounts that need proactive outreach.",
  },
  {
    id: "sla-breach-monitor",
    name: "SLA Breach Monitor",
    description:
      "Check for tickets approaching SLA breach or needing escalation.",
    category: "Support",
    tags: ["zendesk", "sla", "escalation"],
    mcps: ["Zendesk"],
    recommended: true,
    prompt:
      "Check all open support tickets against SLA targets. List any tickets that have already breached SLA or will breach within the next 2 hours. For each, show: ticket ID, customer, priority, how long until breach, and who it's assigned to. Suggest reassignment if the assignee appears overloaded.",
  },
  {
    id: "common-issues-report",
    name: "Common Issues Report",
    description:
      "Identify trending support themes and suggest knowledge base updates.",
    category: "Support",
    tags: ["zendesk", "intercom", "trends", "knowledge-base"],
    mcps: ["Zendesk", "Intercom"],
    prompt:
      "Analyze support tickets from the last week. Group by theme/category and rank by volume. Identify the top 5 most common issues. For each, check if we have documentation covering it — flag gaps where a knowledge base article would reduce ticket volume.",
  },
  {
    id: "knowledge-base-gap-finder",
    name: "Knowledge Base Gap Finder",
    description:
      "Find questions that keep coming up but have no documentation.",
    category: "Support",
    tags: ["zendesk", "notion", "intercom", "docs"],
    mcps: ["Zendesk", "Notion", "Intercom"],
    prompt:
      "Cross-reference frequent support questions with our knowledge base and documentation. Find the top 10 questions customers ask that we don't have good docs for. For each, suggest the title and key points a help article should cover.",
  },
  {
    id: "customer-sentiment-tracker",
    name: "Customer Sentiment Tracker",
    description:
      "Analyze support conversation tone and flag frustrated customers.",
    category: "Support",
    tags: ["zendesk", "intercom", "slack", "sentiment"],
    mcps: ["Zendesk", "Intercom", "Slack"],
    prompt:
      "Analyze the tone of recent support conversations. Identify customers who seem particularly frustrated, angry, or at risk of escalation. List them with context on what went wrong and suggest how to proactively address their concerns before they escalate.",
  },
  {
    id: "ticket-resolution-trends",
    name: "Ticket Resolution Trends",
    description:
      "Track resolution times and identify slowdowns or improvements.",
    category: "Support",
    tags: ["zendesk", "metrics", "resolution"],
    mcps: ["Zendesk"],
    prompt:
      "Analyze support ticket resolution metrics for the last week: average first response time, average resolution time, tickets resolved, and CSAT scores. Compare to the previous week. Identify categories where resolution is getting slower and investigate potential causes.",
  },
  {
    id: "vip-account-monitor",
    name: "VIP Account Monitor",
    description: "Monitor high-value account activity and open tickets.",
    category: "Support",
    tags: ["posthog", "zendesk", "stripe", "vip"],
    mcps: ["PostHog", "Zendesk", "Stripe"],
    prompt:
      "Check our top 10 highest-revenue accounts. For each: are there any open support tickets? Has their product usage changed significantly? Any payment issues? Any error spikes affecting their experience? Create a brief health summary for each.",
  },
  {
    id: "integration-issue-tracker",
    name: "Integration Issue Tracker",
    description: "Track support tickets related to third-party integrations.",
    category: "Support",
    tags: ["zendesk", "github", "integrations"],
    mcps: ["Zendesk", "GitHub"],
    prompt:
      "Find support tickets related to third-party integrations or APIs. Group by integration, count tickets per integration, and flag any integration with a spike in issues. Check if there are known issues in our tracker for the affected integrations.",
  },
  {
    id: "intercom-conversation-digest",
    name: "Intercom Conversation Digest",
    description:
      "Summarize recent Intercom conversations and highlight themes.",
    category: "Support",
    tags: ["intercom", "conversations", "digest"],
    mcps: ["Intercom"],
    prompt:
      "Summarize recent Intercom conversations from the last 24 hours. Group by topic, highlight any urgent issues, and identify common questions. Flag any conversations that need escalation to engineering or were left without a resolution.",
  },
  {
    id: "zendesk-satisfaction-report",
    name: "Zendesk Satisfaction Report",
    description: "Compile CSAT scores, trends, and low-rated interactions.",
    category: "Support",
    tags: ["zendesk", "csat", "quality"],
    mcps: ["Zendesk"],
    prompt:
      "Compile a Zendesk satisfaction report: overall CSAT score this week vs last week, breakdown by agent, and list all tickets that received bad ratings. For low-rated tickets, summarize what went wrong and suggest improvements.",
  },
  {
    id: "support-slack-escalation-digest",
    name: "Support Slack Escalation Digest",
    description: "Summarize support escalations from Slack channels.",
    category: "Support",
    tags: ["slack", "zendesk", "escalation"],
    mcps: ["Slack", "Zendesk"],
    prompt:
      "Review the support escalation Slack channels for messages from the last 24 hours. Summarize each escalation: what's the issue, which customer, current status, and who's handling it. Flag any that appear stalled or need additional help.",
  },
  {
    id: "self-service-opportunity-finder",
    name: "Self-Service Opportunity Finder",
    description:
      "Identify ticket types that could be automated or self-served.",
    category: "Support",
    tags: ["zendesk", "posthog", "automation"],
    mcps: ["Zendesk", "PostHog"],
    prompt:
      "Analyze the last month of support tickets to find categories that could be self-served. Look for: repetitive questions with standard answers, issues that could be solved with better UX, and requests that could be handled by a bot. Estimate how many tickets each automation would deflect.",
  },

  // ─── Sales & CRM (14) ─────────────────────────────────────────────
  {
    id: "account-activity-summary",
    name: "Account Activity Summary",
    description: "Summarize product usage changes for key accounts.",
    category: "Sales",
    tags: ["posthog", "hubspot", "attio", "accounts"],
    mcps: ["PostHog", "HubSpot", "Attio"],
    prompt:
      "For our top accounts, summarize product usage changes over the last week: which accounts are using the product more (expansion signal), which are using it less (churn risk), and any that started using new features. Cross-reference with CRM notes for context.",
  },
  {
    id: "renewal-prep-briefing",
    name: "Renewal Prep Briefing",
    description:
      "Pull usage data, health metrics, and open tickets for upcoming renewals.",
    category: "Sales",
    tags: ["posthog", "stripe", "hubspot", "attio", "renewals"],
    mcps: ["PostHog", "Stripe", "HubSpot", "Attio"],
    recommended: true,
    prompt:
      "Prepare renewal briefings for accounts renewing in the next 30 days. For each: compile product usage trends, support ticket history, payment history, feature adoption, and any open issues. Assess renewal risk (low/medium/high) and suggest talking points for the renewal conversation.",
  },
  {
    id: "expansion-opportunity-finder",
    name: "Expansion Opportunity Finder",
    description:
      "Identify accounts hitting usage limits or exploring new features.",
    category: "Sales",
    tags: ["posthog", "stripe", "expansion", "upsell"],
    mcps: ["PostHog", "Stripe"],
    recommended: true,
    prompt:
      "Find accounts that are likely candidates for expansion: hitting plan limits, exploring premium features, growing team size, or increasing usage rapidly. Rank by expansion potential and suggest which plan or add-on to propose for each.",
  },
  {
    id: "meeting-prep-briefing",
    name: "Meeting Prep Briefing",
    description:
      "Pull recent activity, open tickets, and feature usage for a customer meeting.",
    category: "Sales",
    tags: ["posthog", "hubspot", "attio", "meetings"],
    mcps: ["PostHog", "HubSpot", "Attio", "Google Calendar"],
    prompt:
      "Prepare a briefing for upcoming customer meetings. For each meeting on today's calendar: pull the customer's recent product usage, any open support tickets, recent conversations in the CRM, and payment status. Include suggested talking points and any risks to address.",
  },
  {
    id: "deal-pipeline-review",
    name: "Deal Pipeline Review",
    description: "Summarize pipeline changes, flag stuck or at-risk deals.",
    category: "Sales",
    tags: ["hubspot", "salesforce", "attio", "pipeline"],
    mcps: ["HubSpot", "Salesforce", "Attio"],
    prompt:
      "Review the sales pipeline. Summarize: new deals added this week, deals that advanced stages, deals that went cold (no activity in 14+ days), and deals at risk of slipping from the current quarter. For stuck deals, suggest next actions.",
  },
  {
    id: "upsell-signal-detector",
    name: "Upsell Signal Detector",
    description: "Find accounts whose usage patterns suggest upsell readiness.",
    category: "Sales",
    tags: ["posthog", "stripe", "hubspot", "upsell"],
    mcps: ["PostHog", "Stripe", "HubSpot"],
    prompt:
      "Cross-reference product usage data with billing information to find upsell signals: accounts consistently above 80% of plan limits, teams that added new members, accounts exploring enterprise features, or those whose usage grew 50%+ in the last month. List the top 10 opportunities.",
  },
  {
    id: "contract-expiry-alert",
    name: "Contract Expiry Alert",
    description:
      "List contracts expiring in the next 30/60/90 days with health data.",
    category: "Sales",
    tags: ["stripe", "hubspot", "attio", "contracts"],
    mcps: ["Stripe", "HubSpot", "Attio"],
    prompt:
      "List all contracts or subscriptions expiring in the next 90 days. Group by 30/60/90 day windows. For each, include: account health score, recent usage trends, open support issues, and last contact date. Flag any high-value accounts that haven't been contacted about renewal yet.",
  },
  {
    id: "customer-roi-calculator",
    name: "Customer ROI Calculator",
    description:
      "Pull usage metrics to quantify value delivered for a customer.",
    category: "Sales",
    tags: ["posthog", "stripe", "roi"],
    mcps: ["PostHog", "Stripe"],
    prompt:
      "For key accounts, calculate a rough ROI by pulling: features they use most, volume of usage (events tracked, replays viewed, experiments run), issues caught by error tracking, and decisions influenced by analytics. Frame the value in terms that resonate for a renewal or expansion conversation.",
  },
  {
    id: "prospect-research-briefing",
    name: "Prospect Research Briefing",
    description: "Compile available information on a prospect before outreach.",
    category: "Sales",
    tags: ["hubspot", "attio", "posthog", "prospecting"],
    mcps: ["HubSpot", "Attio", "PostHog"],
    prompt:
      "Research prospective accounts in the CRM. For each prospect: summarize what we know (company, size, industry, tech stack), any trial or free-tier usage in PostHog, previous conversations, and similar customers we've won. Suggest a personalized outreach angle.",
  },
  {
    id: "attio-crm-hygiene",
    name: "Attio CRM Hygiene",
    description:
      "Find stale deals, missing contacts, and incomplete records in Attio.",
    category: "Sales",
    tags: ["attio", "crm", "hygiene"],
    mcps: ["Attio"],
    prompt:
      "Audit Attio CRM data quality. Find: deals with no recent activity, contacts missing key fields (email, company, role), duplicate records, and opportunities with no next step scheduled. Suggest cleanup actions for each category.",
  },
  {
    id: "hubspot-deal-stage-monitor",
    name: "HubSpot Deal Stage Monitor",
    description: "Track deal stage progression and flag deals stuck too long.",
    category: "Sales",
    tags: ["hubspot", "deals", "pipeline"],
    mcps: ["HubSpot"],
    prompt:
      "Review HubSpot deals by stage. For each stage, report: number of deals, average time in stage, and deals that have been in the same stage longer than average. Flag deals stuck in qualification or negotiation for more than 2 weeks with no recent activity.",
  },
  {
    id: "salesforce-pipeline-forecast",
    name: "Salesforce Pipeline Forecast",
    description:
      "Generate a pipeline forecast from Salesforce opportunity data.",
    category: "Sales",
    tags: ["salesforce", "forecast", "pipeline"],
    mcps: ["Salesforce"],
    prompt:
      "Generate a pipeline forecast from Salesforce. Break down by: committed (high confidence), best case, and pipeline. Calculate weighted forecast based on stage probabilities. Compare to quota and flag whether the team is on track for the quarter.",
  },
  {
    id: "stripe-invoice-followup",
    name: "Stripe Invoice Follow-up",
    description: "Find overdue invoices and draft payment reminder follow-ups.",
    category: "Sales",
    tags: ["stripe", "invoices", "collections"],
    mcps: ["Stripe"],
    prompt:
      "Check Stripe for overdue invoices. List each with: customer name, amount, days overdue, and number of reminder attempts. Draft a brief, friendly follow-up message for each. Prioritize by amount and relationship importance.",
  },
  {
    id: "weekly-sales-activity-report",
    name: "Weekly Sales Activity Report",
    description: "Compile calls, emails, and meetings from the past week.",
    category: "Sales",
    tags: ["hubspot", "attio", "slack", "activity"],
    mcps: ["HubSpot", "Attio", "Slack"],
    prompt:
      "Compile a weekly sales activity report: total calls made, emails sent, meetings held, deals created, and deals closed. Compare to targets and last week. Highlight the top performer and any reps who are behind on activity metrics.",
  },

  // ─── Data & Analytics (10) ─────────────────────────────────────────
  {
    id: "data-quality-monitor",
    name: "Data Quality Monitor",
    description:
      "Check for data pipeline failures, missing events, and schema violations.",
    category: "Data",
    tags: ["posthog", "data-quality", "pipeline"],
    mcps: ["PostHog"],
    recommended: true,
    prompt:
      "Check PostHog data quality. Look for: events that stopped sending (comparing today's volume to last week), unexpected null values in key properties, event names that don't match our naming conventions, and any sudden spikes or drops in event volume. Flag issues by severity.",
  },
  {
    id: "anomaly-detection-report",
    name: "Anomaly Detection Report",
    description:
      "Flag unusual patterns in key metrics across all data sources.",
    category: "Data",
    tags: ["posthog", "anomalies", "monitoring"],
    mcps: ["PostHog"],
    recommended: true,
    prompt:
      "Scan key product and business metrics in PostHog for anomalies. For each metric, compare the last 24 hours against the 30-day baseline. Flag anything that deviated more than 2 standard deviations. Include context on what might have caused each anomaly (deploys, campaigns, incidents).",
  },
  {
    id: "dashboard-usage-audit",
    name: "Dashboard Usage Audit",
    description:
      "Review which PostHog dashboards are viewed frequently vs ignored.",
    category: "Data",
    tags: ["posthog", "dashboards", "audit"],
    mcps: ["PostHog"],
    prompt:
      "Audit PostHog dashboards. List all dashboards sorted by view count in the last 30 days. Identify dashboards that nobody looks at (candidates for deletion), dashboards that are viewed daily (most valuable), and any that have broken queries or stale data.",
  },
  {
    id: "event-taxonomy-cleanup",
    name: "Event Taxonomy Cleanup",
    description: "Find duplicate, unused, or poorly named analytics events.",
    category: "Data",
    tags: ["posthog", "events", "taxonomy", "cleanup"],
    mcps: ["PostHog"],
    prompt:
      "Review the PostHog event taxonomy. Find: events with similar names that might be duplicates (e.g., 'user_signup' vs 'user_signed_up'), events with zero volume in the last 30 days, events missing required properties, and events that don't follow naming conventions. Suggest consolidation and cleanup actions.",
  },
  {
    id: "cohort-refresh-report",
    name: "Cohort Refresh Report",
    description: "Update key user cohorts and report on movement between them.",
    category: "Data",
    tags: ["posthog", "cohorts", "segments"],
    mcps: ["PostHog"],
    prompt:
      "Review key PostHog cohorts (active users, power users, at-risk users, new users, etc.). Report current size of each cohort, how it changed since last week, and notable movement between cohorts (e.g., users moving from active to at-risk).",
  },
  {
    id: "custom-report-generator",
    name: "Custom Report Generator",
    description:
      "Build a custom analytics report from specified metrics and dimensions.",
    category: "Data",
    tags: ["posthog", "reports", "analytics"],
    mcps: ["PostHog"],
    prompt:
      "Generate a custom analytics report from PostHog. Include: top-level KPIs (DAU, WAU, MAU, retention), feature usage breakdown, geographic distribution of users, device/browser breakdown, and top user paths. Format as a shareable executive summary.",
  },
  {
    id: "data-freshness-checker",
    name: "Data Freshness Checker",
    description: "Verify that all data pipelines are running on schedule.",
    category: "Data",
    tags: ["posthog", "pipelines", "freshness"],
    mcps: ["PostHog"],
    prompt:
      "Check data freshness across PostHog. For each data source or integration: when was the last event received? Is it within the expected interval? Flag any sources that appear stale or stopped sending data. Check if any batch exports or warehouse syncs are behind schedule.",
  },
  {
    id: "posthog-billing-usage-monitor",
    name: "PostHog Billing Usage Monitor",
    description: "Track PostHog event volume and billing trends.",
    category: "Data",
    tags: ["posthog", "billing", "usage"],
    mcps: ["PostHog"],
    prompt:
      "Check PostHog billing and usage data. Report: current event volume vs plan limits, projected usage for the rest of the billing period, which events are consuming the most volume, and whether we're on track to stay within budget. Flag if we're trending toward overage.",
  },
  {
    id: "airtable-data-sync-check",
    name: "Airtable Data Sync Check",
    description: "Verify Airtable records are in sync with product data.",
    category: "Data",
    tags: ["airtable", "posthog", "sync"],
    mcps: ["Airtable", "PostHog"],
    prompt:
      "Cross-check Airtable records against PostHog data. Find records that are out of sync: entries in Airtable that don't match product state, missing records, and stale entries that need updating. Report discrepancies and suggest how to fix them.",
  },
  {
    id: "warehouse-query-performance",
    name: "Warehouse Query Performance",
    description: "Identify slow PostHog queries and suggest optimizations.",
    category: "Data",
    tags: ["posthog", "performance", "queries"],
    mcps: ["PostHog"],
    prompt:
      "Review PostHog query performance. Find the slowest-running saved insights and dashboards. For each slow query, analyze why it's slow (large date range, unfiltered events, complex joins) and suggest optimizations like adding filters, reducing date ranges, or restructuring the query.",
  },

  // ─── DevOps & Infrastructure (10) ──────────────────────────────────
  {
    id: "incident-postmortem-prep",
    name: "Incident Postmortem Prep",
    description:
      "Gather a timeline of events from errors, deploys, alerts, and comms for postmortem.",
    category: "DevOps",
    tags: ["pagerduty", "sentry", "slack", "github", "postmortem"],
    mcps: ["PagerDuty", "Sentry", "Slack", "GitHub"],
    prompt:
      "Prepare an incident postmortem timeline. Gather: (1) When the issue was first detected (alerts, error spikes), (2) What changed before the incident (recent deploys, config changes), (3) Communication timeline (who was notified, when), (4) Resolution steps taken. Compile into a structured postmortem document.",
  },
  {
    id: "uptime-sla-report",
    name: "Uptime SLA Report",
    description: "Compile service uptime metrics against SLA targets.",
    category: "DevOps",
    tags: ["datadog", "pagerduty", "uptime", "sla"],
    mcps: ["Datadog", "PagerDuty"],
    prompt:
      "Compile an uptime SLA report. For each service: calculate uptime percentage over the last 30 days, list all downtime incidents with duration and cause, and compare against SLA targets. Flag any services that breached or are close to breaching SLA.",
  },
  {
    id: "deployment-frequency-tracker",
    name: "Deployment Frequency Tracker",
    description:
      "Track deploy frequency, lead time, and rollback rate as DORA metrics.",
    category: "DevOps",
    tags: ["github", "dora", "deployments"],
    mcps: ["GitHub"],
    prompt:
      "Calculate DORA metrics from GitHub: deployment frequency (how often we deploy), lead time for changes (commit to deploy), change failure rate (deploys that caused incidents), and mean time to recovery. Compare to last month and identify trends.",
  },
  {
    id: "alert-fatigue-audit",
    name: "Alert Fatigue Audit",
    description: "Review recent alerts and identify noisy or redundant ones.",
    category: "DevOps",
    tags: ["pagerduty", "datadog", "alerts"],
    mcps: ["PagerDuty", "Datadog"],
    prompt:
      "Audit alerts from the last 30 days. Find: alerts that fire frequently but are always resolved without action (noise), duplicate alerts for the same underlying issue, alerts that are always auto-resolved, and critical alerts that were missed. Recommend which alerts to tune, silence, or escalate.",
  },
  {
    id: "performance-regression-monitor",
    name: "Performance Regression Monitor",
    description:
      "Track p50/p95/p99 latencies and flag regressions after deploys.",
    category: "DevOps",
    tags: ["posthog", "datadog", "performance", "latency"],
    mcps: ["PostHog", "Datadog"],
    recommended: true,
    prompt:
      "Check performance metrics since the last deployment: p50, p95, and p99 response times for key endpoints. Compare to the pre-deploy baseline. Flag any endpoints where latency increased significantly. Correlate with the specific commits in the deploy to identify potential causes.",
  },
  {
    id: "pagerduty-on-call-summary",
    name: "PagerDuty On-Call Summary",
    description: "Summarize on-call incidents, response times, and workload.",
    category: "DevOps",
    tags: ["pagerduty", "on-call", "incidents"],
    mcps: ["PagerDuty"],
    recommended: true,
    prompt:
      "Summarize the on-call rotation for the last week. Include: total incidents, average response time, incidents by severity, which services triggered the most pages, and off-hours vs business-hours breakdown. Identify any patterns and suggest improvements to reduce on-call burden.",
  },
  {
    id: "sentry-error-trends",
    name: "Sentry Error Trends",
    description:
      "Review error trends, new issues, and regression alerts from Sentry.",
    category: "DevOps",
    tags: ["sentry", "errors", "trends"],
    mcps: ["Sentry"],
    prompt:
      "Review Sentry error trends for the last 7 days. List: new issues that appeared, issues that regressed (were resolved but came back), issues with the highest event count, and issues affecting the most users. Prioritize by user impact.",
  },
  {
    id: "datadog-monitor-review",
    name: "Datadog Monitor Review",
    description: "Audit Datadog monitors for relevance, gaps, and noise.",
    category: "DevOps",
    tags: ["datadog", "monitors", "audit"],
    mcps: ["Datadog"],
    prompt:
      "Audit Datadog monitors. Find: monitors in a permanent warning/alert state (likely need threshold adjustment), monitors that never trigger (might be misconfigured), critical services without monitors (coverage gaps), and monitors with unclear names or descriptions. Suggest improvements.",
  },
  {
    id: "github-actions-cost-monitor",
    name: "GitHub Actions Cost Monitor",
    description: "Track CI/CD runner usage and cost trends on GitHub Actions.",
    category: "DevOps",
    tags: ["github", "ci", "costs"],
    mcps: ["GitHub"],
    prompt:
      "Review GitHub Actions usage for this repository. Report: total minutes consumed this billing period, breakdown by workflow, most expensive workflows, and trend vs last month. Identify workflows that could be optimized (long-running, frequently failing, or running unnecessarily).",
  },
  {
    id: "infrastructure-drift-detector",
    name: "Infrastructure Drift Detector",
    description: "Flag configuration drift between environments.",
    category: "DevOps",
    tags: ["github", "datadog", "infrastructure"],
    mcps: ["GitHub", "Datadog"],
    prompt:
      "Check for infrastructure configuration drift between staging and production environments. Compare: environment variables, service versions, resource allocations, and feature flags. Flag any differences that are unintentional and could cause issues when deploying.",
  },

  // ─── Design (8) ────────────────────────────────────────────────────
  {
    id: "design-feedback-digest",
    name: "Design Feedback Digest",
    description: "Summarize Figma comments and design review feedback.",
    category: "Design",
    tags: ["figma", "slack", "feedback", "review"],
    mcps: ["Figma", "Slack"],
    recommended: true,
    prompt:
      "Gather design feedback from Figma comments and design review Slack channels. Group by project/file, summarize the feedback themes, and highlight any blocking issues that prevent development from starting. Flag unresolved threads older than 3 days.",
  },
  {
    id: "design-system-usage-audit",
    name: "Design System Usage Audit",
    description:
      "Check which design system components are being used vs ignored.",
    category: "Design",
    tags: ["github", "figma", "design-system"],
    mcps: ["GitHub", "Figma"],
    prompt:
      "Audit design system component usage. Check the codebase for which design system components are actually imported and used vs which exist but are never referenced. Cross-reference with Figma to find components that designers use but developers haven't implemented.",
  },
  {
    id: "accessibility-issue-tracker",
    name: "Accessibility Issue Tracker",
    description: "Monitor accessibility-related issues and compliance status.",
    category: "Design",
    tags: ["linear", "github", "accessibility"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Review accessibility-related issues in our tracker. Summarize: open a11y bugs by severity, recently fixed issues, areas of the product with the most accessibility problems, and any WCAG compliance gaps. Prioritize by user impact and legal risk.",
  },
  {
    id: "user-research-summary",
    name: "User Research Summary",
    description:
      "Compile insights from recent user interviews and usability tests.",
    category: "Design",
    tags: ["notion", "slack", "research"],
    mcps: ["Notion", "Slack"],
    prompt:
      "Review recent user research notes in Notion and research Slack channels. Compile the key insights from the last 2 weeks of interviews and usability tests. Group findings by theme, flag recurring pain points, and highlight any surprising or counter-intuitive findings.",
  },
  {
    id: "design-handoff-checklist",
    name: "Design Handoff Checklist",
    description:
      "Verify that designs have specs, assets, and dev notes before handoff.",
    category: "Design",
    tags: ["figma", "linear", "handoff"],
    mcps: ["Figma", "Linear"],
    recommended: true,
    prompt:
      "Check designs ready for development handoff. For each design in the handoff queue: verify it has complete specs (spacing, colors, typography), exported assets, responsive variants, edge case documentation, and linked Linear issues. Flag any that are incomplete.",
  },
  {
    id: "canva-asset-review",
    name: "Canva Asset Review",
    description: "Review recent Canva designs for brand consistency.",
    category: "Design",
    tags: ["canva", "brand", "review"],
    mcps: ["Canva"],
    prompt:
      "Review recent Canva designs created by the team. Check for brand consistency: correct logo usage, on-brand colors, approved fonts, and proper templates. Flag any designs that deviate from brand guidelines and suggest corrections.",
  },
  {
    id: "figma-file-cleanup",
    name: "Figma File Cleanup",
    description:
      "Find unused pages, detached components, and stale files in Figma.",
    category: "Design",
    tags: ["figma", "cleanup", "organization"],
    mcps: ["Figma"],
    prompt:
      "Audit Figma project files for organization. Find: pages that haven't been edited in 3+ months, components that are detached from the library, files with no description or cover, and duplicate files. Suggest which to archive, update, or delete.",
  },
  {
    id: "design-sprint-tracker",
    name: "Design Sprint Tracker",
    description: "Track design tasks in the current sprint across tools.",
    category: "Design",
    tags: ["linear", "figma", "sprint"],
    mcps: ["Linear", "Figma"],
    prompt:
      "Track design tasks for the current sprint. List all design-related Linear issues: their status, associated Figma files, and whether design review is complete. Flag tasks that are blocked or at risk of not completing this sprint.",
  },

  // ─── Management (10) ──────────────────────────────────────────────
  {
    id: "daily-standup-prep",
    name: "Daily Standup Prep",
    description:
      "Compile what happened yesterday across GitHub, Linear, and Slack for standup.",
    category: "Management",
    tags: ["github", "linear", "slack", "standup", "daily"],
    mcps: ["GitHub", "Linear", "Slack"],
    recommended: true,
    prompt:
      "Prepare a standup summary for the team. Pull from the last 24 hours: PRs merged or reviewed, Linear issues completed or moved, important Slack conversations, and any blockers raised. Format as a brief, scannable update I can share in standup.",
  },
  {
    id: "weekly-team-digest",
    name: "Weekly Team Digest",
    description: "Summarize the week's activity across all connected tools.",
    category: "Management",
    tags: ["github", "linear", "slack", "notion", "weekly"],
    mcps: ["GitHub", "Linear", "Slack", "Notion"],
    recommended: true,
    prompt:
      "Create a weekly team digest covering: (1) What shipped — merged PRs, completed issues, released features, (2) What's in progress — active PRs, current sprint items, (3) What's blocked — stalled items, unanswered questions, (4) Key discussions — important Slack threads or decisions made. Keep it concise and link to details.",
  },
  {
    id: "team-velocity-report",
    name: "Team Velocity Report",
    description: "Track story points, cycle time, and throughput trends.",
    category: "Management",
    tags: ["linear", "github", "velocity", "metrics"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Generate a team velocity report. Include: issues completed this week vs last 4-week average, average cycle time (issue created to closed), PR merge time, and throughput by team member. Identify trends: are we speeding up, slowing down, or steady? Flag any bottlenecks.",
  },
  {
    id: "cross-team-dependency-tracker",
    name: "Cross-Team Dependency Tracker",
    description: "Monitor blocked items waiting on other teams.",
    category: "Management",
    tags: ["linear", "github", "dependencies", "blockers"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Find all issues and PRs that are blocked on other teams. For each: what's blocked, which team we're waiting on, how long it's been blocked, and who the contact is. Prioritize by impact and suggest escalation for anything blocked more than a week.",
  },
  {
    id: "meeting-action-item-tracker",
    name: "Meeting Action Item Tracker",
    description: "Extract and track action items from recent meeting notes.",
    category: "Management",
    tags: ["notion", "slack", "google-calendar", "action-items"],
    mcps: ["Notion", "Slack", "Google Calendar"],
    prompt:
      "Review meeting notes from the last week in Notion and Slack. Extract all action items: who owns each one, what's the deadline, and current status. Flag any that are overdue or have no clear owner. Compile into a single trackable list.",
  },
  {
    id: "team-workload-balance",
    name: "Team Workload Balance",
    description: "Review issue assignments and flag uneven distribution.",
    category: "Management",
    tags: ["linear", "github", "workload"],
    mcps: ["Linear", "GitHub"],
    prompt:
      "Analyze the current workload distribution across the team. For each person: count assigned issues (by priority), active PRs, and review requests. Flag anyone who's significantly overloaded or underloaded compared to the team average. Suggest rebalancing.",
  },
  {
    id: "quarterly-okr-progress",
    name: "Quarterly OKR Progress",
    description:
      "Track progress on OKRs and goals from project management tools.",
    category: "Management",
    tags: ["linear", "notion", "okrs", "goals"],
    mcps: ["Linear", "Notion"],
    prompt:
      "Check progress on quarterly OKRs/goals. For each objective: what's the current key result status, are we on track, and what work was completed this week toward it? Flag any objectives that are falling behind and suggest corrective actions.",
  },
  {
    id: "monday-project-status",
    name: "Monday Project Status",
    description: "Compile Monday.com project status across multiple boards.",
    category: "Management",
    tags: ["monday", "projects", "status"],
    mcps: ["Monday"],
    prompt:
      "Review all active Monday.com boards and compile a project status overview. For each project: overall status (green/yellow/red), key milestones this week, upcoming deadlines, and blockers. Format as an executive-ready status report.",
  },
  {
    id: "notion-meeting-notes-digest",
    name: "Notion Meeting Notes Digest",
    description: "Summarize this week's meeting notes from Notion.",
    category: "Management",
    tags: ["notion", "meetings", "digest"],
    mcps: ["Notion"],
    prompt:
      "Review all meeting notes added to Notion this week. For each meeting: extract the key decisions, action items, and follow-ups. Compile into a weekly digest that helps anyone who missed a meeting stay informed.",
  },
  {
    id: "calendar-meeting-load-analysis",
    name: "Calendar Meeting Load Analysis",
    description:
      "Analyze meeting load and find overbooked days for better scheduling.",
    category: "Management",
    tags: ["google-calendar", "meetings", "time-management"],
    mcps: ["Google Calendar"],
    prompt:
      "Analyze my calendar for the next 2 weeks. Report: total meeting hours per day, longest stretch without a break, days with back-to-back meetings, and time available for deep work. Suggest meetings that could be shortened, made async, or rescheduled to create better focus blocks.",
  },

  // ─── Communication & Sync (12) ────────────────────────────────────
  {
    id: "slack-channel-digest",
    name: "Slack Channel Digest",
    description:
      "Summarize key messages from specified Slack channels overnight.",
    category: "Communication",
    tags: ["slack", "digest", "channels"],
    mcps: ["Slack"],
    recommended: true,
    prompt:
      "Summarize the key messages from important Slack channels since I last checked (assume overnight). For each channel: highlight decisions made, questions asked (especially ones directed at me), important announcements, and action items. Skip small talk and reactions — only include things I need to know.",
  },
  {
    id: "slack-thread-followup",
    name: "Slack Thread Follow-up",
    description:
      "Find Slack threads where you were mentioned but didn't respond.",
    category: "Communication",
    tags: ["slack", "mentions", "followup"],
    mcps: ["Slack"],
    prompt:
      "Check my Slack mentions and threads from the last 48 hours. Find any where I was tagged or directly asked a question but haven't responded yet. List each with the channel, who asked, what they need, and how urgent it seems.",
  },
  {
    id: "slack-decision-extractor",
    name: "Slack Decision Extractor",
    description:
      "Extract decisions from Slack conversations and log them in Notion.",
    category: "Communication",
    tags: ["slack", "notion", "decisions"],
    mcps: ["Slack", "Notion"],
    prompt:
      "Scan recent Slack conversations for decisions that were made (look for phrases like 'let's go with', 'decided to', 'agreed on', etc.). For each decision: capture what was decided, who was involved, and the context. Format them ready to add to a Notion decision log.",
  },
  {
    id: "email-followup-reminder",
    name: "Email Follow-up Reminder",
    description: "Check for emails awaiting a response and draft follow-ups.",
    category: "Communication",
    tags: ["gmail", "email", "followup"],
    mcps: ["Gmail"],
    prompt:
      "Check my email for messages I sent that haven't received a reply in 3+ days. List each with: recipient, subject, when I sent it, and a brief draft follow-up message. Also check for emails in my inbox that I haven't responded to yet.",
  },
  {
    id: "gmail-inbox-summary",
    name: "Gmail Inbox Summary",
    description: "Summarize unread emails, prioritized by sender and urgency.",
    category: "Communication",
    tags: ["gmail", "email", "inbox", "summary"],
    mcps: ["Gmail"],
    prompt:
      "Summarize my unread emails. Group by: urgent/action-needed, FYI/informational, and can-wait. For urgent emails, include the sender, subject, and what action is needed. Skip newsletters, automated notifications, and marketing emails unless they're from important contacts.",
  },
  {
    id: "cross-tool-sync-checker",
    name: "Cross-Tool Sync Checker",
    description:
      "Verify that issues, tickets, and threads are in sync across tools.",
    category: "Communication",
    tags: ["github", "linear", "slack", "sync"],
    mcps: ["GitHub", "Linear", "Slack"],
    prompt:
      "Check for sync issues between our tools. Find: Linear issues that reference GitHub PRs that don't exist (or vice versa), Slack threads about issues with no corresponding tracker item, and completed issues that still have open PRs. Flag discrepancies that need cleanup.",
  },
  {
    id: "meeting-notes-distributor",
    name: "Meeting Notes Distributor",
    description:
      "Post meeting notes and action items from calendar events to appropriate channels.",
    category: "Communication",
    tags: ["google-calendar", "slack", "notion", "meetings"],
    mcps: ["Google Calendar", "Slack", "Notion"],
    prompt:
      "For recent meetings that have notes: check if the notes and action items have been shared with all attendees. Draft a brief summary for each meeting with key decisions and action items, formatted for posting in the relevant Slack channel or Notion page.",
  },
  {
    id: "stakeholder-update-drafter",
    name: "Stakeholder Update Drafter",
    description:
      "Compile a status update for stakeholders from multiple data sources.",
    category: "Communication",
    tags: ["posthog", "linear", "github", "slack", "update"],
    mcps: ["PostHog", "Linear", "GitHub", "Slack"],
    prompt:
      "Draft a stakeholder status update. Pull from: (1) Product metrics from PostHog (key numbers, trends), (2) Engineering progress from Linear/GitHub (what shipped, what's next), (3) Customer feedback themes from support channels. Format as a professional, concise update suitable for leadership or investors.",
  },
  {
    id: "todo-aggregator",
    name: "Todo Aggregator",
    description:
      "Collect open action items assigned to you across all connected tools.",
    category: "Communication",
    tags: ["linear", "github", "slack", "notion", "todos"],
    mcps: ["Linear", "GitHub", "Slack", "Notion"],
    recommended: true,
    prompt:
      "Gather all my open action items from every connected tool: assigned Linear issues, GitHub PR review requests, Slack messages I need to respond to, Notion tasks assigned to me, and any other pending items. Compile into a single prioritized todo list with deadlines and links.",
  },
  {
    id: "notification-digest",
    name: "Notification Digest",
    description:
      "Compile important notifications from all tools into one summary.",
    category: "Communication",
    tags: ["github", "linear", "slack", "notifications"],
    mcps: ["GitHub", "Linear", "Slack"],
    prompt:
      "Compile my unread notifications from GitHub (PR reviews, issue mentions, CI results), Linear (assigned issues, comments), and Slack (mentions, DMs). Filter out noise and present only the ones that need my attention, sorted by urgency.",
  },
  {
    id: "discord-community-digest",
    name: "Discord Community Digest",
    description:
      "Summarize community Discord activity, top questions, and engagement.",
    category: "Communication",
    tags: ["discord", "community", "digest"],
    mcps: ["Discord"],
    prompt:
      "Summarize activity from our community Discord server. Highlight: top questions asked (and whether they were answered), feature requests or feedback shared, any bug reports, and most active discussions. Flag unanswered questions that the team should respond to.",
  },
  {
    id: "twilio-comms-summary",
    name: "Twilio Communications Summary",
    description: "Review recent SMS and call activity and response rates.",
    category: "Communication",
    tags: ["twilio", "sms", "calls"],
    mcps: ["Twilio"],
    prompt:
      "Review Twilio communication activity for the last week. Summarize: messages sent vs delivered vs responded, call volumes and durations, any delivery failures, and opt-out rates. Flag any campaigns with declining response rates or high opt-out rates.",
  },
];
