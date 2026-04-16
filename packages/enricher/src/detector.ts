import {
  findFlagAssignments as _findFlagAssignments,
  findFunctions as _findFunctions,
  findInitCalls as _findInitCalls,
  findPostHogCalls as _findPostHogCalls,
} from "./call-detector.js";
import { ParserManager } from "./parser-manager.js";
import type {
  DetectionConfig,
  FlagAssignment,
  FunctionInfo,
  PostHogCall,
  PostHogInitCall,
  VariantBranch,
} from "./types.js";
import { findVariantBranches as _findVariantBranches } from "./variant-detector.js";

export class PostHogDetector {
  private pm = new ParserManager();

  updateConfig(config: DetectionConfig): void {
    this.pm.updateConfig(config);
  }

  isSupported(langId: string): boolean {
    return this.pm.isSupported(langId);
  }

  get supportedLanguages(): string[] {
    return this.pm.supportedLanguages;
  }

  async findPostHogCalls(
    source: string,
    languageId: string,
  ): Promise<PostHogCall[]> {
    return _findPostHogCalls(this.pm, source, languageId);
  }

  async findInitCalls(
    source: string,
    languageId: string,
  ): Promise<PostHogInitCall[]> {
    return _findInitCalls(this.pm, source, languageId);
  }

  async findFunctions(
    source: string,
    languageId: string,
  ): Promise<FunctionInfo[]> {
    return _findFunctions(this.pm, source, languageId);
  }

  async findVariantBranches(
    source: string,
    languageId: string,
  ): Promise<VariantBranch[]> {
    return _findVariantBranches(this.pm, source, languageId);
  }

  async findFlagAssignments(
    source: string,
    languageId: string,
  ): Promise<FlagAssignment[]> {
    return _findFlagAssignments(this.pm, source, languageId);
  }

  dispose(): void {
    this.pm.dispose();
  }
}
