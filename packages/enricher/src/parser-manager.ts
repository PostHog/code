import * as path from "node:path";
import Parser from "web-tree-sitter";
import type { LangFamily } from "./languages.js";
import { LANG_FAMILIES } from "./languages.js";
import { warn } from "./log.js";
import type { DetectionConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export class ParserManager {
  private parser: Parser | null = null;
  private languages = new Map<string, Parser.Language>();
  private queryCache = new Map<string, Parser.Query>();
  private maxCacheSize = 256;
  private initPromise: Promise<void> | null = null;
  private wasmDir = "";
  config: DetectionConfig = DEFAULT_CONFIG;

  updateConfig(config: DetectionConfig): void {
    this.config = config;
    this.queryCache.clear();
  }

  async initialize(wasmDir: string): Promise<void> {
    this.wasmDir = wasmDir;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      await Parser.init({
        locateFile: (scriptName: string) => path.join(this.wasmDir, scriptName),
      });
      this.parser = new Parser();
    } catch (err) {
      warn("Failed to initialize tree-sitter parser", err);
      throw err;
    }
  }

  isSupported(langId: string): boolean {
    return langId in LANG_FAMILIES;
  }

  get supportedLanguages(): string[] {
    return Object.keys(LANG_FAMILIES);
  }

  async ensureReady(
    langId: string,
  ): Promise<{ lang: Parser.Language; family: LangFamily } | null> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.parser) {
      return null;
    }

    const family = LANG_FAMILIES[langId];
    if (!family) {
      return null;
    }

    let lang = this.languages.get(family.wasm);
    if (!lang) {
      try {
        const wasmPath = path.join(this.wasmDir, family.wasm);
        lang = await Parser.Language.load(wasmPath);
        this.languages.set(family.wasm, lang);
      } catch (err) {
        warn(`Failed to load grammar ${family.wasm}`, err);
        return null;
      }
    }

    return { lang, family };
  }

  parse(text: string, lang: Parser.Language): Parser.Tree | null {
    if (!this.parser) {
      return null;
    }
    this.parser.setLanguage(lang);
    return this.parser.parse(text);
  }

  getQuery(lang: Parser.Language, queryStr: string): Parser.Query | null {
    if (!queryStr.trim()) {
      return null;
    }

    const cacheKey = `${lang.toString()}:${queryStr}`;
    let query = this.queryCache.get(cacheKey);
    if (query) {
      // LRU: move to end by deleting and re-inserting
      this.queryCache.delete(cacheKey);
      this.queryCache.set(cacheKey, query);
      return query;
    }

    try {
      query = lang.query(queryStr);
      // Evict oldest entry if at capacity
      if (this.queryCache.size >= this.maxCacheSize) {
        const oldest = this.queryCache.keys().next().value;
        if (oldest !== undefined) {
          this.queryCache.delete(oldest);
        }
      }
      this.queryCache.set(cacheKey, query);
      return query;
    } catch (err) {
      warn("Query compilation failed", err);
      return null;
    }
  }

  dispose(): void {
    this.parser?.delete();
    this.parser = null;
    this.initPromise = null;
    this.languages.clear();
    this.queryCache.clear();
  }
}
