import { PostHogDetector } from "./detector.js";
import { warn } from "./log.js";
import { ParseResult } from "./parse-result.js";
import type { DetectionConfig } from "./types.js";

export class PostHogEnricher {
  private detector = new PostHogDetector();

  async initialize(wasmDir: string): Promise<void> {
    return this.detector.initialize(wasmDir);
  }

  updateConfig(config: DetectionConfig): void {
    this.detector.updateConfig(config);
  }

  isSupported(langId: string): boolean {
    return this.detector.isSupported(langId);
  }

  get supportedLanguages(): string[] {
    return this.detector.supportedLanguages;
  }

  async parse(source: string, languageId: string): Promise<ParseResult> {
    const results = await Promise.allSettled([
      this.detector.findPostHogCalls(source, languageId),
      this.detector.findInitCalls(source, languageId),
      this.detector.findFlagAssignments(source, languageId),
      this.detector.findVariantBranches(source, languageId),
      this.detector.findFunctions(source, languageId),
    ]);

    const settled = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return r.value;
      }
      const labels = [
        "calls",
        "initCalls",
        "flagAssignments",
        "variantBranches",
        "functions",
      ];
      warn(`enricher: ${labels[i]} detection failed`, r.reason);
      return [];
    });

    return new ParseResult(
      source,
      languageId,
      settled[0] as Awaited<ReturnType<PostHogDetector["findPostHogCalls"]>>,
      settled[1] as Awaited<ReturnType<PostHogDetector["findInitCalls"]>>,
      settled[2] as Awaited<ReturnType<PostHogDetector["findFlagAssignments"]>>,
      settled[3] as Awaited<ReturnType<PostHogDetector["findVariantBranches"]>>,
      settled[4] as Awaited<ReturnType<PostHogDetector["findFunctions"]>>,
    );
  }

  dispose(): void {
    this.detector.dispose();
  }
}
