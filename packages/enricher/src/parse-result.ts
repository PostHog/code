import { EnrichedResult } from "./enriched-result.js";
import { PostHogApi } from "./posthog-api.js";
import type {
  CapturedEvent,
  EnricherApiConfig,
  FlagAssignment,
  FlagCheck,
  FunctionInfo,
  ListItem,
  PostHogCall,
  PostHogInitCall,
  VariantBranch,
} from "./types.js";

const CAPTURE_METHODS = new Set(["capture", "Enqueue"]);

export class ParseResult {
  readonly source: string;
  readonly languageId: string;
  readonly calls: readonly PostHogCall[];
  readonly initCalls: readonly PostHogInitCall[];
  readonly flagAssignments: readonly FlagAssignment[];
  readonly variantBranches: readonly VariantBranch[];
  readonly functions: readonly FunctionInfo[];

  constructor(
    source: string,
    languageId: string,
    calls: PostHogCall[],
    initCalls: PostHogInitCall[],
    flagAssignments: FlagAssignment[],
    variantBranches: VariantBranch[],
    functions: FunctionInfo[],
  ) {
    this.source = source;
    this.languageId = languageId;
    this.calls = calls;
    this.initCalls = initCalls;
    this.flagAssignments = flagAssignments;
    this.variantBranches = variantBranches;
    this.functions = functions;
  }

  get events(): CapturedEvent[] {
    return this.calls
      .filter((c) => CAPTURE_METHODS.has(c.method))
      .map((c) => ({
        name: c.key,
        line: c.line,
        dynamic: c.dynamic ?? false,
      }));
  }

  get flagChecks(): FlagCheck[] {
    return this.calls
      .filter((c) => !CAPTURE_METHODS.has(c.method))
      .map((c) => ({
        method: c.method,
        flagKey: c.key,
        line: c.line,
      }));
  }

  get flagKeys(): string[] {
    return [...new Set(this.flagChecks.map((c) => c.flagKey))];
  }

  get eventNames(): string[] {
    return [
      ...new Set(this.events.filter((e) => !e.dynamic).map((e) => e.name)),
    ];
  }

  toList(): ListItem[] {
    const items: ListItem[] = [];

    for (const init of this.initCalls) {
      items.push({
        type: "init",
        line: init.tokenLine,
        name: init.token,
        method: "init",
      });
    }

    for (const call of this.calls) {
      const isEvent = CAPTURE_METHODS.has(call.method);
      items.push({
        type: isEvent ? "event" : "flag",
        line: call.line,
        name: call.key,
        method: call.method,
        detail: call.dynamic ? "dynamic event name" : undefined,
      });
    }

    return items.sort((a, b) => a.line - b.line);
  }

  async enrichFromApi(config: EnricherApiConfig): Promise<EnrichedResult> {
    const api = new PostHogApi(config);
    const flagKeys = this.flagKeys;
    const eventNames = this.eventNames;

    const [allFlags, allExperiments, allEventDefs, eventStats] =
      await Promise.all([
        flagKeys.length > 0 ? api.getFeatureFlags() : Promise.resolve([]),
        flagKeys.length > 0 ? api.getExperiments() : Promise.resolve([]),
        eventNames.length > 0
          ? api.getEventDefinitions(eventNames)
          : Promise.resolve([]),
        eventNames.length > 0
          ? api.getEventStats(eventNames)
          : Promise.resolve(new Map()),
      ]);

    const flagKeySet = new Set(flagKeys);
    const flags = new Map(
      allFlags.filter((f) => flagKeySet.has(f.key)).map((f) => [f.key, f]),
    );

    const experiments = allExperiments.filter((e) =>
      flagKeySet.has(e.feature_flag_key),
    );

    const eventDefinitions = new Map(
      allEventDefs
        .filter((d) => eventNames.includes(d.name))
        .map((d) => [d.name, d]),
    );

    return new EnrichedResult(this, {
      flags,
      experiments,
      eventDefinitions,
      eventStats,
    });
  }
}
