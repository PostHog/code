import type { EnrichedResult } from "./enriched-result.js";
import type { FlagType, StalenessReason } from "./types.js";

export interface SerializedFlagOccurrence {
  method: string;
  line: number;
  startCol: number;
  endCol: number;
}

export interface SerializedFlagVariant {
  key: string;
  rolloutPercentage: number;
}

export interface SerializedFlagExperiment {
  id: number;
  name: string;
  status: "running" | "complete";
}

export interface SerializedFlag {
  flagKey: string;
  flagId: number | null;
  flagType: FlagType;
  staleness: StalenessReason | null;
  rollout: number | null;
  active: boolean;
  variants: SerializedFlagVariant[];
  occurrences: SerializedFlagOccurrence[];
  experiment: SerializedFlagExperiment | null;
}

export interface SerializedEventOccurrence {
  line: number;
  startCol: number;
  endCol: number;
  dynamic: boolean;
}

export interface SerializedEvent {
  eventName: string;
  definitionId: string | null;
  verified: boolean;
  description: string | null;
  tags: string[];
  lastSeenAt: string | null;
  volume: number | null;
  uniqueUsers: number | null;
  occurrences: SerializedEventOccurrence[];
}

export interface SerializedEnrichment {
  flags: SerializedFlag[];
  events: SerializedEvent[];
}

export function toSerializable(enriched: EnrichedResult): SerializedEnrichment {
  const flags: SerializedFlag[] = enriched.flags.map((f) => ({
    flagKey: f.flagKey,
    flagId: f.flag?.id ?? null,
    flagType: f.flagType,
    staleness: f.staleness,
    rollout: f.rollout,
    active: f.flag?.active ?? false,
    variants: f.variants.map((v) => ({
      key: v.key,
      rolloutPercentage: v.rollout_percentage,
    })),
    occurrences: f.occurrences.map((o) => ({
      method: o.method,
      line: o.line,
      startCol: o.keyStartCol,
      endCol: o.keyEndCol,
    })),
    experiment: f.experiment
      ? {
          id: f.experiment.id,
          name: f.experiment.name,
          status: f.experiment.end_date ? "complete" : "running",
        }
      : null,
  }));

  const events: SerializedEvent[] = enriched.events.map((e) => ({
    eventName: e.eventName,
    definitionId: e.definition?.id ?? null,
    verified: e.verified,
    description: e.definition?.description ?? null,
    tags: e.tags,
    lastSeenAt: e.lastSeenAt,
    volume: e.stats?.volume ?? null,
    uniqueUsers: e.stats?.uniqueUsers ?? null,
    occurrences: e.occurrences.map((o) => ({
      line: o.line,
      startCol: o.keyStartCol,
      endCol: o.keyEndCol,
      dynamic: o.dynamic,
    })),
  }));

  return { flags, events };
}
