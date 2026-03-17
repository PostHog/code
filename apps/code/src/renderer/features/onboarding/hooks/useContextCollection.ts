import type { Icon } from "@phosphor-icons/react";
import {
  Bug,
  ChartLine,
  GithubLogo,
  GitPullRequest,
  Kanban,
  Monitor,
  Ticket,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SourceConfig {
  id: string;
  label: string;
  icon: Icon;
  color: string;
  mockItems: string[];
  targetCount: number;
  startDelay: number;
  scanDuration: number;
}

export interface SourceState {
  config: SourceConfig;
  status: "waiting" | "scanning" | "done";
  currentItem: string | null;
  currentCount: number;
}

const SOURCES: SourceConfig[] = [
  {
    id: "ph-events",
    label: "PostHog Events",
    icon: ChartLine,
    color: "orange",
    targetCount: 1247,
    startDelay: 300,
    scanDuration: 6000,
    mockItems: [
      "$pageview on /pricing",
      "$autocapture button click",
      "user_signed_up",
      "$pageview on /docs",
      "feature_flag_called",
      "insight_viewed",
      "$pageleave on /settings",
      "dashboard_loaded",
      "invite_sent",
      "export_started",
    ],
  },
  {
    id: "ph-errors",
    label: "PostHog Errors",
    icon: Bug,
    color: "red",
    targetCount: 83,
    startDelay: 800,
    scanDuration: 4500,
    mockItems: [
      "TypeError: Cannot read 'id' of undefined",
      "ChunkLoadError in checkout.js",
      "NetworkError: Failed to fetch",
      "RangeError: Maximum call stack exceeded",
      "SyntaxError: Unexpected token",
      "ReferenceError: session is not defined",
    ],
  },
  {
    id: "ph-sessions",
    label: "Session Recordings",
    icon: Monitor,
    color: "amber",
    targetCount: 342,
    startDelay: 1200,
    scanDuration: 5000,
    mockItems: [
      "Session 3m 42s — /checkout flow",
      "Session 1m 15s — /onboarding",
      "Session 8m 03s — /dashboard",
      "Session 0m 45s — /pricing → bounce",
      "Session 5m 21s — /settings → /billing",
    ],
  },
  {
    id: "gh-issues",
    label: "GitHub Issues",
    icon: GithubLogo,
    color: "gray",
    targetCount: 156,
    startDelay: 2000,
    scanDuration: 5000,
    mockItems: [
      "#423: Fix checkout flow regression",
      "#891: Add dark mode support",
      "#1024: Improve onboarding UX",
      "#756: API rate limiting not working",
      "#1102: Mobile layout broken on iPad",
      "#943: Add webhook retry logic",
    ],
  },
  {
    id: "gh-prs",
    label: "GitHub PRs",
    icon: GitPullRequest,
    color: "gray",
    targetCount: 89,
    startDelay: 2500,
    scanDuration: 4000,
    mockItems: [
      "PR #156: Migrate auth to OAuth2",
      "PR #203: Update billing page",
      "PR #187: Fix N+1 query in dashboard",
      "PR #211: Add feature flag for new UI",
      "PR #198: Refactor event pipeline",
    ],
  },
  {
    id: "linear",
    label: "Linear Issues",
    icon: Kanban,
    color: "violet",
    targetCount: 64,
    startDelay: 3000,
    scanDuration: 3500,
    mockItems: [
      "ENG-342: Implement SSO",
      "ENG-401: Migrate to new API",
      "ENG-389: Fix flaky test suite",
      "ENG-415: Add audit logging",
      "ENG-378: Optimize query performance",
    ],
  },
  {
    id: "zendesk",
    label: "Zendesk Tickets",
    icon: Ticket,
    color: "green",
    targetCount: 31,
    startDelay: 3500,
    scanDuration: 3000,
    mockItems: [
      "Ticket: Can't export CSV from dashboard",
      "Ticket: SSO login failing intermittently",
      "Ticket: Feature request — dark mode",
      "Ticket: Billing page shows wrong plan",
      "Ticket: API docs outdated for v2",
    ],
  },
];

const PHASES: { time: number; text: string }[] = [
  { time: 0, text: "Connecting to your data..." },
  { time: 1500, text: "Scanning PostHog events..." },
  { time: 3000, text: "Reading GitHub issues..." },
  { time: 5500, text: "Analyzing patterns..." },
  { time: 7000, text: "Finding priorities..." },
];

const TICK_MS = 100;
const ITEM_CYCLE_MS = 1500;

export function useContextCollection() {
  const [sources, setSources] = useState<SourceState[]>(() =>
    SOURCES.map((config) => ({
      config,
      status: "waiting" as const,
      currentItem: null,
      currentCount: 0,
    })),
  );
  const [phase, setPhase] = useState("Connecting to your data...");
  const [isAllDone, setIsAllDone] = useState(false);

  const elapsedRef = useRef(0);
  const itemCycleRef = useRef<Map<string, number>>(new Map());
  const itemIndexRef = useRef<Map<string, number>>(new Map());

  const tick = useCallback(() => {
    elapsedRef.current += TICK_MS;
    const elapsed = elapsedRef.current;

    // Update phase text
    for (const p of PHASES) {
      if (elapsed >= p.time) {
        setPhase(p.text);
      }
    }

    setSources((prev) => {
      let changed = false;
      const next = prev.map((source) => {
        const { config } = source;
        const sourceElapsed = elapsed - config.startDelay;

        // Not started yet
        if (sourceElapsed < 0) return source;

        // Just started scanning
        if (source.status === "waiting") {
          changed = true;
          itemIndexRef.current.set(config.id, 0);
          itemCycleRef.current.set(config.id, 0);
          return {
            ...source,
            status: "scanning" as const,
            currentItem: config.mockItems[0],
          };
        }

        // Done scanning
        if (
          source.status === "scanning" &&
          sourceElapsed >= config.scanDuration
        ) {
          changed = true;
          return {
            ...source,
            status: "done" as const,
            currentItem: null,
            currentCount: config.targetCount,
          };
        }

        // Cycling items during scan
        if (source.status === "scanning") {
          const lastCycle = itemCycleRef.current.get(config.id) ?? 0;
          if (elapsed - lastCycle >= ITEM_CYCLE_MS) {
            changed = true;
            itemCycleRef.current.set(config.id, elapsed);
            const idx =
              ((itemIndexRef.current.get(config.id) ?? 0) + 1) %
              config.mockItems.length;
            itemIndexRef.current.set(config.id, idx);

            // Ease-out count increment
            const progress = sourceElapsed / config.scanDuration;
            const easedProgress = 1 - (1 - progress) ** 2;
            const newCount = Math.min(
              Math.round(easedProgress * config.targetCount),
              config.targetCount,
            );

            return {
              ...source,
              currentItem: config.mockItems[idx],
              currentCount: newCount,
            };
          }
        }

        return source;
      });

      if (!changed) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [tick]);

  // Check if all done
  useEffect(() => {
    const allDone = sources.every((s) => s.status === "done");
    if (allDone && !isAllDone) {
      setIsAllDone(true);
      setPhase("Ready!");
    }
  }, [sources, isAllDone]);

  const totalItems = sources.reduce((sum, s) => sum + s.currentCount, 0);

  return { sources, phase, isAllDone, totalItems };
}
