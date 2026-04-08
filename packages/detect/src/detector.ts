import * as path from "node:path";
import Parser from "web-tree-sitter";
import type { LangFamily } from "./languages.js";
import { CLIENT_NAMES, LANG_FAMILIES } from "./languages.js";
import type {
  CompletionContext,
  DetectionConfig,
  FlagAssignment,
  FunctionInfo,
  Position,
  PostHogCall,
  PostHogInitCall,
  VariantBranch,
} from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

// ── Service ──

export class PostHogDetector {
  private parser: Parser | null = null;
  private languages = new Map<string, Parser.Language>();
  private queryCache = new Map<string, Parser.Query>();
  private initPromise: Promise<void> | null = null;
  private wasmDir = "";
  private config: DetectionConfig = DEFAULT_CONFIG;

  updateConfig(config: DetectionConfig): void {
    this.config = config;
    this.queryCache.clear();
  }

  private getEffectiveClients(): Set<string> {
    const clients = new Set(CLIENT_NAMES);
    for (const name of this.config.additionalClientNames) {
      clients.add(name);
    }
    return clients;
  }

  private extractClientName(node: Parser.SyntaxNode): string | null {
    if (node.type === "identifier") {
      return node.text;
    }
    if (this.config.detectNestedClients) {
      // member_expression: window.posthog → extract "posthog"
      if (node.type === "member_expression" || node.type === "attribute") {
        const prop =
          node.childForFieldName("property") ||
          node.childForFieldName("attribute");
        if (prop) {
          return prop.text;
        }
      }
      // Go: selector_expression — e.g. pkg.Client
      if (node.type === "selector_expression") {
        const field = node.childForFieldName("field");
        if (field) {
          return field.text;
        }
      }
      // optional_chain_expression wrapping member_expression
      if (node.type === "optional_chain_expression") {
        const inner = node.namedChildren[0];
        if (inner?.type === "member_expression") {
          const prop = inner.childForFieldName("property");
          if (prop) {
            return prop.text;
          }
        }
      }
    }
    return null;
  }

  /**
   * Initialize the detector with the path to a directory containing
   * tree-sitter WASM files (tree-sitter.wasm + language grammars).
   */
  async initialize(wasmDir: string): Promise<void> {
    this.wasmDir = wasmDir;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    await Parser.init({
      locateFile: (scriptName: string) => path.join(this.wasmDir, scriptName),
    });
    this.parser = new Parser();
  }

  isSupported(langId: string): boolean {
    return langId in LANG_FAMILIES;
  }

  get supportedLanguages(): string[] {
    return Object.keys(LANG_FAMILIES);
  }

  // ── Core: parse + query ──

  private async ensureReady(
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
        console.warn(`[PostHog] Failed to load grammar ${family.wasm}:`, err);
        return null;
      }
    }

    return { lang, family };
  }

  private parse(text: string, lang: Parser.Language): Parser.Tree | null {
    if (!this.parser) {
      return null;
    }
    this.parser.setLanguage(lang);
    return this.parser.parse(text);
  }

  private getQuery(
    lang: Parser.Language,
    queryStr: string,
  ): Parser.Query | null {
    if (!queryStr.trim()) {
      return null;
    }

    const cacheKey = `${lang.toString()}:${queryStr}`;
    let query = this.queryCache.get(cacheKey);
    if (query) {
      return query;
    }

    try {
      query = lang.query(queryStr);
      this.queryCache.set(cacheKey, query);
      return query;
    } catch (err) {
      console.warn("[PostHog] Query compilation failed:", err);
      return null;
    }
  }

  // ── Alias resolution ──

  private findAliases(
    lang: Parser.Language,
    tree: Parser.Tree,
    family: LangFamily,
  ): {
    clientAliases: Set<string>;
    destructuredCapture: Set<string>;
    destructuredFlag: Set<string>;
  } {
    const clientAliases = new Set<string>();
    const destructuredCapture = new Set<string>();
    const destructuredFlag = new Set<string>();

    // Client aliases: const tracker = posthog
    const aliasQuery = this.getQuery(lang, family.queries.clientAliases);
    if (aliasQuery) {
      const matches = aliasQuery.matches(tree.rootNode);
      for (const match of matches) {
        const aliasNode = match.captures.find((c) => c.name === "alias");
        const sourceNode = match.captures.find((c) => c.name === "source");
        if (
          aliasNode &&
          sourceNode &&
          this.getEffectiveClients().has(sourceNode.node.text)
        ) {
          clientAliases.add(aliasNode.node.text);
        }
      }
    }

    // Constructor aliases: const client = new PostHog('phc_...')
    // Go: client := posthog.New("token") or client, _ := posthog.NewWithConfig("token", ...)
    const constructorQuery = this.getQuery(
      lang,
      family.queries.constructorAliases,
    );
    if (constructorQuery) {
      const matches = constructorQuery.matches(tree.rootNode);
      for (const match of matches) {
        const aliasNode = match.captures.find((c) => c.name === "alias");
        const classNode = match.captures.find((c) => c.name === "class_name");
        const pkgNode = match.captures.find((c) => c.name === "pkg_name");
        const funcNode = match.captures.find((c) => c.name === "func_name");

        // JS/Python: new PostHog(...) or Posthog(...)
        if (
          aliasNode &&
          classNode &&
          (classNode.node.text === "PostHog" ||
            classNode.node.text === "Posthog")
        ) {
          clientAliases.add(aliasNode.node.text);
        }
        // Go: posthog.New(...) or posthog.NewWithConfig(...)
        if (
          aliasNode &&
          pkgNode &&
          funcNode &&
          pkgNode.node.text === "posthog" &&
          (funcNode.node.text === "New" ||
            funcNode.node.text === "NewWithConfig")
        ) {
          clientAliases.add(aliasNode.node.text);
        }
        // Ruby: PostHog::Client.new(...)
        const scopeNode = match.captures.find((c) => c.name === "scope_name");
        const methodNameNode = match.captures.find(
          (c) => c.name === "method_name",
        );
        if (
          aliasNode &&
          scopeNode &&
          classNode &&
          methodNameNode &&
          (scopeNode.node.text === "PostHog" ||
            scopeNode.node.text === "Posthog") &&
          classNode.node.text === "Client" &&
          methodNameNode.node.text === "new"
        ) {
          clientAliases.add(aliasNode.node.text);
        }
      }
    }

    // Destructured methods: const { capture, getFeatureFlag } = posthog
    if (family.queries.destructuredMethods) {
      const destructQuery = this.getQuery(
        lang,
        family.queries.destructuredMethods,
      );
      if (destructQuery) {
        const matches = destructQuery.matches(tree.rootNode);
        for (const match of matches) {
          const methodNode = match.captures.find(
            (c) => c.name === "method_name",
          );
          const sourceNode = match.captures.find((c) => c.name === "source");
          if (
            methodNode &&
            sourceNode &&
            this.getEffectiveClients().has(sourceNode.node.text)
          ) {
            const name = methodNode.node.text;
            if (family.captureMethods.has(name)) {
              destructuredCapture.add(name);
            }
            if (family.flagMethods.has(name)) {
              destructuredFlag.add(name);
            }
          }
        }
      }
    }

    return { clientAliases, destructuredCapture, destructuredFlag };
  }

  // ── Public API ──

  async findPostHogCalls(
    source: string,
    languageId: string,
  ): Promise<PostHogCall[]> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return [];
    }

    const { lang, family } = ready;
    const tree = this.parse(source, lang);
    if (!tree) {
      return [];
    }

    const calls: PostHogCall[] = [];
    const allClients = this.getEffectiveClients();

    // Resolve aliases
    const { clientAliases, destructuredCapture, destructuredFlag } =
      this.findAliases(lang, tree, family);
    for (const a of clientAliases) {
      allClients.add(a);
    }

    // Direct method calls: posthog.capture("event")
    const callQuery = this.getQuery(lang, family.queries.postHogCalls);
    if (callQuery) {
      const matches = callQuery.matches(tree.rootNode);
      for (const match of matches) {
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const keyNode = match.captures.find((c) => c.name === "key");

        if (!clientNode || !methodNode || !keyNode) {
          continue;
        }

        const clientName = this.extractClientName(clientNode.node);
        const method = methodNode.node.text;

        if (!clientName || !allClients.has(clientName)) {
          continue;
        }
        if (!family.allMethods.has(method)) {
          continue;
        }

        // For Python, skip capture in the generic query — the first arg is distinct_id, not the event.
        // Python capture is handled separately by the pythonCaptureCalls query.
        if (
          family.queries.pythonCaptureCalls &&
          family.captureMethods.has(method)
        ) {
          continue;
        }

        // For Ruby, skip capture — event is in the `event:` keyword arg, not the first positional arg.
        // Ruby capture is handled separately by the rubyCaptureCalls query.
        if (
          family.queries.rubyCaptureCalls &&
          family.captureMethods.has(method)
        ) {
          continue;
        }

        calls.push({
          method,
          key: this.cleanStringValue(keyNode.node.text),
          line: keyNode.node.startPosition.row,
          keyStartCol: keyNode.node.startPosition.column,
          keyEndCol: keyNode.node.endPosition.column,
        });
      }
    }

    // Go struct-based calls: client.Enqueue(posthog.Capture{Event: "purchase"})
    // and client.GetFeatureFlag(posthog.FeatureFlagPayload{Key: "my-flag"})
    if (family.queries.goStructCalls) {
      const structQuery = this.getQuery(lang, family.queries.goStructCalls);
      if (structQuery) {
        for (const match of structQuery.matches(tree.rootNode)) {
          const clientNode = match.captures.find((c) => c.name === "client");
          const methodNode = match.captures.find((c) => c.name === "method");
          const fieldNameNode = match.captures.find(
            (c) => c.name === "field_name",
          );
          const keyNode = match.captures.find((c) => c.name === "key");
          if (!clientNode || !methodNode || !fieldNameNode || !keyNode) {
            continue;
          }

          const clientName = this.extractClientName(clientNode.node);
          const method = methodNode.node.text;
          const fieldName = fieldNameNode.node.text;
          if (!clientName || !allClients.has(clientName)) {
            continue;
          }

          // For Enqueue(posthog.Capture{Event: "..."}), method is "Enqueue" and we want Event field
          // For GetFeatureFlag(posthog.FeatureFlagPayload{Key: "..."}), we want Key field
          const isCapture = method === "Enqueue" && fieldName === "Event";
          const isFlag = family.flagMethods.has(method) && fieldName === "Key";
          if (!isCapture && !isFlag) {
            continue;
          }

          const effectiveMethod = isCapture ? "capture" : method;
          const key = this.cleanStringValue(keyNode.node.text);
          const line = keyNode.node.startPosition.row;
          if (calls.some((c) => c.line === line && c.key === key)) {
            continue;
          }

          calls.push({
            method: effectiveMethod,
            key,
            line,
            keyStartCol: keyNode.node.startPosition.column,
            keyEndCol: keyNode.node.endPosition.column,
          });
        }
      }
    }

    // Node SDK capture calls: client.capture({ event: 'purchase', ... })
    const nodeCaptureQuery = this.getQuery(
      lang,
      family.queries.nodeCaptureCalls,
    );
    if (nodeCaptureQuery) {
      const matches = nodeCaptureQuery.matches(tree.rootNode);
      for (const match of matches) {
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const propNameNode = match.captures.find((c) => c.name === "prop_name");
        const keyNode = match.captures.find((c) => c.name === "key");

        if (!clientNode || !methodNode || !propNameNode || !keyNode) {
          continue;
        }

        const clientName = this.extractClientName(clientNode.node);
        const method = methodNode.node.text;

        if (!clientName || !allClients.has(clientName)) {
          continue;
        }
        if (method !== "capture") {
          continue;
        }
        if (propNameNode.node.text !== "event") {
          continue;
        }

        calls.push({
          method,
          key: this.cleanStringValue(keyNode.node.text),
          line: keyNode.node.startPosition.row,
          keyStartCol: keyNode.node.startPosition.column,
          keyEndCol: keyNode.node.endPosition.column,
        });
      }
    }

    // Python capture: posthog.capture(distinct_id, 'event_name', ...)
    // Event is the 2nd positional arg, or the `event` keyword argument
    if (family.queries.pythonCaptureCalls) {
      const pyCaptureQuery = this.getQuery(
        lang,
        family.queries.pythonCaptureCalls,
      );
      if (pyCaptureQuery) {
        const matches = pyCaptureQuery.matches(tree.rootNode);
        for (const match of matches) {
          const clientNode = match.captures.find((c) => c.name === "client");
          const methodNode = match.captures.find((c) => c.name === "method");
          const keyNode = match.captures.find((c) => c.name === "key");
          const kwargNameNode = match.captures.find(
            (c) => c.name === "kwarg_name",
          );

          if (!clientNode || !methodNode || !keyNode) {
            continue;
          }

          const clientName = this.extractClientName(clientNode.node);
          const method = methodNode.node.text;

          if (!clientName || !allClients.has(clientName)) {
            continue;
          }
          if (method !== "capture") {
            continue;
          }

          // For keyword argument form, only match event=
          if (kwargNameNode && kwargNameNode.node.text !== "event") {
            continue;
          }

          const key = this.cleanStringValue(keyNode.node.text);
          const line = keyNode.node.startPosition.row;

          // Skip if already matched on this line (from postHogCalls query)
          if (calls.some((c) => c.line === line && c.key === key)) {
            continue;
          }

          calls.push({
            method,
            key,
            line,
            keyStartCol: keyNode.node.startPosition.column,
            keyEndCol: keyNode.node.endPosition.column,
          });
        }
      }
    }

    // Ruby capture: client.capture(distinct_id: 'user', event: 'purchase')
    // Event name is in the `event:` keyword argument (hash_key_symbol)
    if (family.queries.rubyCaptureCalls) {
      const rbCaptureQuery = this.getQuery(
        lang,
        family.queries.rubyCaptureCalls,
      );
      if (rbCaptureQuery) {
        const matches = rbCaptureQuery.matches(tree.rootNode);
        for (const match of matches) {
          const clientNode = match.captures.find((c) => c.name === "client");
          const methodNode = match.captures.find((c) => c.name === "method");
          const keyNode = match.captures.find((c) => c.name === "key");
          const kwargNameNode = match.captures.find(
            (c) => c.name === "kwarg_name",
          );

          if (!clientNode || !methodNode || !keyNode || !kwargNameNode) {
            continue;
          }

          const clientName = this.extractClientName(clientNode.node);
          const method = methodNode.node.text;

          if (!clientName || !allClients.has(clientName)) {
            continue;
          }
          if (method !== "capture") {
            continue;
          }
          if (kwargNameNode.node.text !== "event") {
            continue;
          }

          const key = this.cleanStringValue(keyNode.node.text);
          const line = keyNode.node.startPosition.row;

          if (calls.some((c) => c.line === line && c.key === key)) {
            continue;
          }

          calls.push({
            method,
            key,
            line,
            keyStartCol: keyNode.node.startPosition.column,
            keyEndCol: keyNode.node.endPosition.column,
          });
        }
      }
    }

    // Bare function calls from destructured methods: capture("event")
    if (destructuredCapture.size > 0 || destructuredFlag.size > 0) {
      const bareQuery = this.getQuery(lang, family.queries.bareFunctionCalls);
      if (bareQuery) {
        const matches = bareQuery.matches(tree.rootNode);
        for (const match of matches) {
          const funcNode = match.captures.find((c) => c.name === "func_name");
          const keyNode = match.captures.find((c) => c.name === "key");
          if (!funcNode || !keyNode) {
            continue;
          }

          const name = funcNode.node.text;
          if (destructuredCapture.has(name) || destructuredFlag.has(name)) {
            calls.push({
              method: name,
              key: this.cleanStringValue(keyNode.node.text),
              line: keyNode.node.startPosition.row,
              keyStartCol: keyNode.node.startPosition.column,
              keyEndCol: keyNode.node.endPosition.column,
            });
          }
        }
      }
    }

    // Additional flag functions: useFeatureFlag("key"), etc.
    if (
      this.config.additionalFlagFunctions.length > 0 &&
      family.queries.bareFunctionCalls
    ) {
      const additionalFlagFuncs = new Set(this.config.additionalFlagFunctions);
      const bareQuery = this.getQuery(lang, family.queries.bareFunctionCalls);
      if (bareQuery) {
        const matches = bareQuery.matches(tree.rootNode);
        for (const match of matches) {
          const funcNode = match.captures.find((c) => c.name === "func_name");
          const keyNode = match.captures.find((c) => c.name === "key");
          if (!funcNode || !keyNode) {
            continue;
          }

          if (additionalFlagFuncs.has(funcNode.node.text)) {
            calls.push({
              method: funcNode.node.text,
              key: this.cleanStringValue(keyNode.node.text),
              line: keyNode.node.startPosition.row,
              keyStartCol: keyNode.node.startPosition.column,
              keyEndCol: keyNode.node.endPosition.column,
            });
          }
        }
      }
    }

    // Resolve calls with identifier first argument: posthog.capture(MY_CONST) / posthog.getFeatureFlag(FLAG_KEY)
    const constantMap = this.buildConstantMap(lang, tree);
    if (constantMap.size > 0) {
      let identArgQueryStr: string;
      if (family.queries.rubyCaptureCalls) {
        // Ruby: call with receiver + method, identifier or constant args
        identArgQueryStr = `
                    (call
                        receiver: (_) @client
                        method: (identifier) @method
                        arguments: (argument_list . (identifier) @arg_id)) @call

                    (call
                        receiver: (_) @client
                        method: (identifier) @method
                        arguments: (argument_list . (constant) @arg_id)) @call`;
      } else if (family.queries.goStructCalls) {
        // Go: selector_expression + argument_list
        identArgQueryStr = `(call_expression
                    function: (selector_expression
                        operand: (_) @client
                        field: (field_identifier) @method)
                    arguments: (argument_list . (identifier) @arg_id)) @call`;
      } else if (family.queries.pythonCaptureCalls) {
        identArgQueryStr = `(call
                    function: (attribute
                        object: (_) @client
                        attribute: (identifier) @method)
                    arguments: (argument_list . (identifier) @arg_id)) @call`;
      } else {
        identArgQueryStr = `(call_expression
                    function: (member_expression
                        object: (_) @client
                        property: (property_identifier) @method)
                    arguments: (arguments . (identifier) @arg_id)) @call`;
      }
      const identArgQuery = this.getQuery(lang, identArgQueryStr);
      if (identArgQuery) {
        const identMatches = identArgQuery.matches(tree.rootNode);
        for (const match of identMatches) {
          const clientNode = match.captures.find((c) => c.name === "client");
          const methodNode = match.captures.find((c) => c.name === "method");
          const argNode = match.captures.find((c) => c.name === "arg_id");
          if (!clientNode || !methodNode || !argNode) {
            continue;
          }

          const clientName = this.extractClientName(clientNode.node);
          const method = methodNode.node.text;
          if (!clientName || !allClients.has(clientName)) {
            continue;
          }
          if (!family.allMethods.has(method)) {
            continue;
          }

          const resolved = constantMap.get(argNode.node.text);
          if (!resolved) {
            continue;
          }

          // Skip if already matched with a string literal on this line
          const line = argNode.node.startPosition.row;
          if (calls.some((c) => c.line === line && c.key === resolved)) {
            continue;
          }

          calls.push({
            method,
            key: resolved,
            line,
            keyStartCol: argNode.node.startPosition.column,
            keyEndCol: argNode.node.endPosition.column,
          });
        }
      }
    }

    // Detect dynamic capture calls (non-string first argument)
    const matchedLines = new Set(calls.map((c) => c.line));

    let dynamicQueryStr: string;
    if (family.queries.rubyCaptureCalls) {
      // Ruby: call with receiver + method
      dynamicQueryStr = `(call
                receiver: (_) @client
                method: (identifier) @method
                arguments: (argument_list . (_) @first_arg)) @call`;
    } else if (family.queries.goStructCalls) {
      // Go: selector_expression + argument_list
      dynamicQueryStr = `(call_expression
                function: (selector_expression
                    operand: (_) @client
                    field: (field_identifier) @method)
                arguments: (argument_list . (_) @first_arg)) @call`;
    } else if (family.queries.pythonCaptureCalls) {
      // Python: attribute + argument_list
      dynamicQueryStr = `(call
                function: (attribute
                    object: (_) @client
                    attribute: (identifier) @method)
                arguments: (argument_list . (_) @first_arg)) @call`;
    } else {
      // JS/TS: member_expression + arguments
      dynamicQueryStr = `(call_expression
                function: (member_expression
                    object: (_) @client
                    property: (property_identifier) @method)
                arguments: (arguments . (_) @first_arg)) @call`;
    }
    const dynamicQuery = this.getQuery(lang, dynamicQueryStr);
    if (dynamicQuery) {
      const matches = dynamicQuery.matches(tree.rootNode);
      for (const match of matches) {
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const firstArgNode = match.captures.find((c) => c.name === "first_arg");
        if (!clientNode || !methodNode || !firstArgNode) {
          continue;
        }

        const clientName = this.extractClientName(clientNode.node);
        const method = methodNode.node.text;
        if (!clientName || !allClients.has(clientName)) {
          continue;
        }
        if (!family.captureMethods.has(method)) {
          continue;
        }

        const line = firstArgNode.node.startPosition.row;
        if (matchedLines.has(line)) {
          continue;
        } // already matched with a string key

        calls.push({
          method,
          key: "",
          line,
          keyStartCol: firstArgNode.node.startPosition.column,
          keyEndCol: firstArgNode.node.endPosition.column,
          dynamic: true,
        });
        matchedLines.add(line);
      }
    }

    return calls;
  }

  async findInitCalls(
    source: string,
    languageId: string,
  ): Promise<PostHogInitCall[]> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return [];
    }

    const { lang } = ready;
    const tree = this.parse(source, lang);
    if (!tree) {
      return [];
    }

    const allClients = this.getEffectiveClients();
    const results: PostHogInitCall[] = [];

    // Pattern 1: posthog.init('token', { ... })
    const initQueryStr = `
            (call_expression
                function: (member_expression
                    object: (_) @client
                    property: (property_identifier) @method)
                arguments: (arguments
                    (string (string_fragment) @token)
                    (object)? @config)) @call
        `;

    const initQuery = this.getQuery(lang, initQueryStr);
    if (initQuery) {
      for (const match of initQuery.matches(tree.rootNode)) {
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const tokenNode = match.captures.find((c) => c.name === "token");
        const configNode = match.captures.find((c) => c.name === "config");

        if (!clientNode || !methodNode || !tokenNode) {
          continue;
        }
        if (methodNode.node.text !== "init") {
          continue;
        }

        const clientName = this.extractClientName(clientNode.node);
        if (!clientName || !allClients.has(clientName)) {
          continue;
        }

        results.push(this.buildInitCall(tokenNode.node, configNode?.node));
      }
    }

    // Pattern 2: new PostHog('token', { ... }) — Node SDK
    const constructorQueryStr = `
            (new_expression
                constructor: (identifier) @class_name
                arguments: (arguments
                    (string (string_fragment) @token)
                    (object)? @config)) @call
        `;

    const ctorQuery = this.getQuery(lang, constructorQueryStr);
    if (ctorQuery) {
      for (const match of ctorQuery.matches(tree.rootNode)) {
        const classNode = match.captures.find((c) => c.name === "class_name");
        const tokenNode = match.captures.find((c) => c.name === "token");
        const configNode = match.captures.find((c) => c.name === "config");

        if (!classNode || !tokenNode) {
          continue;
        }
        if (classNode.node.text !== "PostHog") {
          continue;
        }

        results.push(this.buildInitCall(tokenNode.node, configNode?.node));
      }
    }

    // Pattern 3a: Posthog('phc_token', host='...') — positional token
    const pyCtorQueryStr = `
            (call
                function: (identifier) @class_name
                arguments: (argument_list
                    (string (string_content) @token))) @call
        `;

    // Pattern 3b: Posthog(api_key='phc_token', host='...') — keyword token
    const pyCtorKwQueryStr = `
            (call
                function: (identifier) @class_name
                arguments: (argument_list
                    (keyword_argument
                        name: (identifier) @kw_name
                        value: (string (string_content) @token)))) @call
        `;

    const pyCtorKwQuery = this.getQuery(lang, pyCtorKwQueryStr);
    if (pyCtorKwQuery) {
      for (const match of pyCtorKwQuery.matches(tree.rootNode)) {
        const classNode = match.captures.find((c) => c.name === "class_name");
        const kwNameNode = match.captures.find((c) => c.name === "kw_name");
        const tokenNode = match.captures.find((c) => c.name === "token");

        if (!classNode || !kwNameNode || !tokenNode) {
          continue;
        }
        if (
          classNode.node.text !== "PostHog" &&
          classNode.node.text !== "Posthog"
        ) {
          continue;
        }
        if (
          kwNameNode.node.text !== "api_key" &&
          kwNameNode.node.text !== "project_api_key"
        ) {
          continue;
        }

        // Check we didn't already match this call via positional pattern
        const line = tokenNode.node.startPosition.row;
        if (results.some((r) => r.tokenLine === line)) {
          continue;
        }

        // Extract other keyword args for config
        const callNode = match.captures.find((c) => c.name === "call");
        const configProperties = new Map<string, string>();
        let apiHost: string | null = null;

        if (callNode) {
          const argsNode = callNode.node.childForFieldName("arguments");
          if (argsNode) {
            for (const child of argsNode.namedChildren) {
              if (child.type === "keyword_argument") {
                const nameNode = child.childForFieldName("name");
                const valueNode = child.childForFieldName("value");
                if (
                  nameNode &&
                  valueNode &&
                  nameNode.text !== "api_key" &&
                  nameNode.text !== "project_api_key"
                ) {
                  const key = nameNode.text;
                  let value = valueNode.text;
                  if (valueNode.type === "string") {
                    const content = valueNode.namedChildren.find(
                      (c) => c.type === "string_content",
                    );
                    if (content) {
                      value = content.text;
                    }
                  }
                  configProperties.set(key, value);
                  if (key === "host" || key === "api_host") {
                    apiHost = value;
                  }
                }
              }
            }
          }
        }

        results.push({
          token: this.cleanStringValue(tokenNode.node.text),
          tokenLine: tokenNode.node.startPosition.row,
          tokenStartCol: tokenNode.node.startPosition.column,
          tokenEndCol: tokenNode.node.endPosition.column,
          apiHost,
          configProperties,
        });
      }
    }

    const pyCtorQuery = this.getQuery(lang, pyCtorQueryStr);
    if (pyCtorQuery) {
      for (const match of pyCtorQuery.matches(tree.rootNode)) {
        const classNode = match.captures.find((c) => c.name === "class_name");
        const tokenNode = match.captures.find((c) => c.name === "token");

        if (!classNode || !tokenNode) {
          continue;
        }
        if (
          classNode.node.text !== "PostHog" &&
          classNode.node.text !== "Posthog"
        ) {
          continue;
        }

        // Extract keyword arguments for config
        const callNode = match.captures.find((c) => c.name === "call");
        const configProperties = new Map<string, string>();
        let apiHost: string | null = null;

        if (callNode) {
          const argsNode = callNode.node.childForFieldName("arguments");
          if (argsNode) {
            for (const child of argsNode.namedChildren) {
              if (child.type === "keyword_argument") {
                const nameNode = child.childForFieldName("name");
                const valueNode = child.childForFieldName("value");
                if (nameNode && valueNode) {
                  const key = nameNode.text;
                  let value = valueNode.text;
                  if (valueNode.type === "string") {
                    const content = valueNode.namedChildren.find(
                      (c) => c.type === "string_content",
                    );
                    if (content) {
                      value = content.text;
                    }
                  }
                  configProperties.set(key, value);
                  if (key === "host" || key === "api_host") {
                    apiHost = value;
                  }
                }
              }
            }
          }
        }

        results.push({
          token: this.cleanStringValue(tokenNode.node.text),
          tokenLine: tokenNode.node.startPosition.row,
          tokenStartCol: tokenNode.node.startPosition.column,
          tokenEndCol: tokenNode.node.endPosition.column,
          apiHost,
          configProperties,
        });
      }
    }

    // Pattern 4: Go — posthog.New("phc_token") or posthog.NewWithConfig("phc_token", posthog.Config{Endpoint: "..."})
    const goCtorQueryStr = `
            (call_expression
                function: (selector_expression
                    operand: (identifier) @pkg_name
                    field: (field_identifier) @func_name)
                arguments: (argument_list
                    (interpreted_string_literal) @token)) @call
        `;

    const goCtorQuery = this.getQuery(lang, goCtorQueryStr);
    if (goCtorQuery) {
      for (const match of goCtorQuery.matches(tree.rootNode)) {
        const pkgNode = match.captures.find((c) => c.name === "pkg_name");
        const funcNode = match.captures.find((c) => c.name === "func_name");
        const tokenNode = match.captures.find((c) => c.name === "token");

        if (!pkgNode || !funcNode || !tokenNode) {
          continue;
        }
        if (pkgNode.node.text !== "posthog") {
          continue;
        }
        if (
          funcNode.node.text !== "New" &&
          funcNode.node.text !== "NewWithConfig"
        ) {
          continue;
        }

        const token = this.cleanStringValue(tokenNode.node.text);
        const line = tokenNode.node.startPosition.row;
        if (results.some((r) => r.tokenLine === line)) {
          continue;
        }

        // Try to extract Endpoint from Config struct literal
        const configProperties = new Map<string, string>();
        let apiHost: string | null = null;

        const callNode = match.captures.find((c) => c.name === "call");
        if (callNode) {
          const argsNode = callNode.node.childForFieldName("arguments");
          if (argsNode) {
            for (const arg of argsNode.namedChildren) {
              if (arg.type === "composite_literal") {
                const body = arg.childForFieldName("body");
                if (body) {
                  for (const elem of body.namedChildren) {
                    if (elem.type === "keyed_element") {
                      const children = elem.namedChildren;
                      if (children.length >= 2) {
                        const keyElem = children[0];
                        const valElem = children[1];
                        const keyId =
                          keyElem.type === "literal_element"
                            ? keyElem.namedChildren[0]?.text || keyElem.text
                            : keyElem.text;
                        const valText = this.cleanStringValue(valElem.text);
                        if (keyId) {
                          configProperties.set(keyId, valText);
                          if (keyId === "Endpoint" || keyId === "Host") {
                            apiHost = valText;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        results.push({
          token,
          tokenLine: tokenNode.node.startPosition.row,
          tokenStartCol: tokenNode.node.startPosition.column,
          tokenEndCol: tokenNode.node.endPosition.column,
          apiHost,
          configProperties,
        });
      }
    }

    // Pattern 5: Ruby — PostHog::Client.new(api_key: 'phc_token', host: '...')
    const rbCtorQueryStr = `
            (call
                receiver: (scope_resolution
                    scope: (constant) @scope_name
                    name: (constant) @class_name)
                method: (identifier) @method_name
                arguments: (argument_list
                    (pair
                        (hash_key_symbol) @kw_name
                        (string (string_content) @token)))) @call
        `;
    const rbCtorQuery = this.getQuery(lang, rbCtorQueryStr);
    if (rbCtorQuery) {
      for (const match of rbCtorQuery.matches(tree.rootNode)) {
        const scopeNode = match.captures.find((c) => c.name === "scope_name");
        const classNode = match.captures.find((c) => c.name === "class_name");
        const methodNode = match.captures.find((c) => c.name === "method_name");
        const kwNameNode = match.captures.find((c) => c.name === "kw_name");
        const tokenNode = match.captures.find((c) => c.name === "token");

        if (
          !scopeNode ||
          !classNode ||
          !methodNode ||
          !kwNameNode ||
          !tokenNode
        ) {
          continue;
        }
        if (
          scopeNode.node.text !== "PostHog" &&
          scopeNode.node.text !== "Posthog"
        ) {
          continue;
        }
        if (classNode.node.text !== "Client") {
          continue;
        }
        if (methodNode.node.text !== "new") {
          continue;
        }
        if (kwNameNode.node.text !== "api_key") {
          continue;
        }

        const line = tokenNode.node.startPosition.row;
        if (results.some((r) => r.tokenLine === line)) {
          continue;
        }

        // Extract other keyword args for config
        const callNode = match.captures.find((c) => c.name === "call");
        const configProperties = new Map<string, string>();
        let apiHost: string | null = null;

        if (callNode) {
          const argsNode = callNode.node.childForFieldName("arguments");
          if (argsNode) {
            for (const child of argsNode.namedChildren) {
              if (child.type === "pair") {
                const keyN = child.namedChildren[0];
                const valueN = child.namedChildren[1];
                if (
                  keyN?.type === "hash_key_symbol" &&
                  valueN &&
                  keyN.text !== "api_key"
                ) {
                  const key = keyN.text;
                  let value = valueN.text;
                  if (valueN.type === "string") {
                    const content = valueN.namedChildren.find(
                      (c) => c.type === "string_content",
                    );
                    if (content) {
                      value = content.text;
                    }
                  }
                  configProperties.set(key, value);
                  if (key === "host" || key === "api_host") {
                    apiHost = value;
                  }
                }
              }
            }
          }
        }

        results.push({
          token: this.cleanStringValue(tokenNode.node.text),
          tokenLine: tokenNode.node.startPosition.row,
          tokenStartCol: tokenNode.node.startPosition.column,
          tokenEndCol: tokenNode.node.endPosition.column,
          apiHost,
          configProperties,
        });
      }
    }

    return results;
  }

  private buildInitCall(
    tokenNode: Parser.SyntaxNode,
    configNode: Parser.SyntaxNode | undefined,
  ): PostHogInitCall {
    const token = this.cleanStringValue(tokenNode.text);
    const configProperties = new Map<string, string>();
    let apiHost: string | null = null;

    if (configNode) {
      for (const child of configNode.namedChildren) {
        if (child.type === "pair") {
          const keyN = child.childForFieldName("key");
          const valueN = child.childForFieldName("value");
          if (keyN && valueN) {
            const key = keyN.text.replace(/['"]/g, "");
            let value = valueN.text;
            if (valueN.type === "string") {
              const frag = valueN.namedChildren.find(
                (c) => c.type === "string_fragment",
              );
              if (frag) {
                value = frag.text;
              }
            }
            configProperties.set(key, value);
            if (key === "api_host" || key === "host") {
              apiHost = value;
            }
          }
        }
      }
    }

    return {
      token,
      tokenLine: tokenNode.startPosition.row,
      tokenStartCol: tokenNode.startPosition.column,
      tokenEndCol: tokenNode.endPosition.column,
      apiHost,
      configProperties,
    };
  }

  async findFunctions(
    source: string,
    languageId: string,
  ): Promise<FunctionInfo[]> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return [];
    }

    const { lang, family } = ready;
    const text = source;
    const tree = this.parse(text, lang);
    if (!tree) {
      return [];
    }

    const query = this.getQuery(lang, family.queries.functions);
    if (!query) {
      return [];
    }

    const functions: FunctionInfo[] = [];
    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const nameNode = match.captures.find((c) => c.name === "func_name");
      const paramsNode = match.captures.find((c) => c.name === "func_params");
      const singleParamNode = match.captures.find(
        (c) => c.name === "func_single_param",
      );
      const bodyNode = match.captures.find((c) => c.name === "func_body");

      if (!nameNode || !bodyNode) {
        continue;
      }

      const name = nameNode.node.text;
      // Skip control flow keywords that might match method patterns
      if (["if", "for", "while", "switch", "catch", "else"].includes(name)) {
        continue;
      }

      const params = singleParamNode
        ? [singleParamNode.node.text]
        : paramsNode
          ? this.extractParams(paramsNode.node.text)
          : [];

      const bodyLine = bodyNode.node.startPosition.row;
      const nextLineIdx = bodyLine + 1;
      const lines = text.split("\n");
      const nextLine = nextLineIdx < lines.length ? lines[nextLineIdx] : "";
      const bodyIndent = nextLine.match(/^(\s*)/)?.[1] || "    ";

      functions.push({
        name,
        params,
        isComponent: /^[A-Z]/.test(name),
        bodyLine,
        bodyIndent,
      });
    }

    return functions;
  }

  async findVariantBranches(
    source: string,
    languageId: string,
  ): Promise<VariantBranch[]> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return [];
    }

    const { lang, family } = ready;
    const tree = this.parse(source, lang);
    if (!tree) {
      return [];
    }

    const allClients = this.getEffectiveClients();
    const { clientAliases } = this.findAliases(lang, tree, family);
    for (const a of clientAliases) {
      allClients.add(a);
    }

    const branches: VariantBranch[] = [];

    // 1. Find flag variable assignments: const variant = posthog.getFeatureFlag("key")
    const assignQuery = this.getQuery(lang, family.queries.flagAssignments);
    if (assignQuery) {
      const matches = assignQuery.matches(tree.rootNode);
      for (const match of matches) {
        const varNode = match.captures.find((c) => c.name === "var_name");
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const keyNode = match.captures.find((c) => c.name === "flag_key");
        const assignNode = match.captures.find((c) => c.name === "assignment");

        if (!varNode || !clientNode || !methodNode || !keyNode) {
          continue;
        }
        const varClientName = this.extractClientName(clientNode.node);
        if (!varClientName || !allClients.has(varClientName)) {
          continue;
        }

        const method = methodNode.node.text;
        if (!family.flagMethods.has(method)) {
          continue;
        }

        const varName = varNode.node.text;
        const flagKey = this.cleanStringValue(keyNode.node.text);
        const afterNode = assignNode?.node || varNode.node;

        // Find if-chains and switches using this variable
        this.findIfChainsForVar(
          tree.rootNode,
          varName,
          flagKey,
          afterNode,
          branches,
        );
        this.findSwitchForVar(
          tree.rootNode,
          varName,
          flagKey,
          afterNode,
          branches,
        );
      }
    }

    // 1a. Resolve flag assignments with identifier arguments: const v = posthog.getFeatureFlag(MY_FLAG)
    const constantMap = this.buildConstantMap(lang, tree);
    if (constantMap.size > 0) {
      let identAssignQueryStr: string;
      if (family.queries.rubyCaptureCalls !== undefined) {
        // Ruby: assignment with identifier or constant argument
        identAssignQueryStr = `
                    (assignment
                        left: (identifier) @var_name
                        right: (call
                            receiver: (_) @client
                            method: (identifier) @method
                            arguments: (argument_list . (identifier) @flag_id))) @assignment

                    (assignment
                        left: (identifier) @var_name
                        right: (call
                            receiver: (_) @client
                            method: (identifier) @method
                            arguments: (argument_list . (constant) @flag_id))) @assignment`;
      } else if (family.queries.pythonCaptureCalls !== undefined) {
        // Python: assignment with identifier argument
        identAssignQueryStr = `(expression_statement
                    (assignment
                        left: (identifier) @var_name
                        right: (call
                            function: (attribute
                                object: (_) @client
                                attribute: (identifier) @method)
                            arguments: (argument_list . (identifier) @flag_id)))) @assignment`;
      } else {
        // JS: const/let/var with identifier argument
        identAssignQueryStr = `(lexical_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (member_expression
                                object: (_) @client
                                property: (property_identifier) @method)
                            arguments: (arguments . (identifier) @flag_id)))) @assignment

                (lexical_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (await_expression
                            (call_expression
                                function: (member_expression
                                    object: (_) @client
                                    property: (property_identifier) @method)
                                arguments: (arguments . (identifier) @flag_id))))) @assignment

                (variable_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (member_expression
                                object: (_) @client
                                property: (property_identifier) @method)
                            arguments: (arguments . (identifier) @flag_id)))) @assignment

                (variable_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (await_expression
                            (call_expression
                                function: (member_expression
                                    object: (_) @client
                                    property: (property_identifier) @method)
                                arguments: (arguments . (identifier) @flag_id))))) @assignment`;
      }
      const identAssignQuery = this.getQuery(lang, identAssignQueryStr);
      if (identAssignQuery) {
        const matches = identAssignQuery.matches(tree.rootNode);
        for (const match of matches) {
          const varNode = match.captures.find((c) => c.name === "var_name");
          const clientNode = match.captures.find((c) => c.name === "client");
          const methodNode = match.captures.find((c) => c.name === "method");
          const argNode = match.captures.find((c) => c.name === "flag_id");
          const assignNode = match.captures.find(
            (c) => c.name === "assignment",
          );

          if (!varNode || !clientNode || !methodNode || !argNode) {
            continue;
          }
          const varClientName = this.extractClientName(clientNode.node);
          if (!varClientName || !allClients.has(varClientName)) {
            continue;
          }
          if (!family.flagMethods.has(methodNode.node.text)) {
            continue;
          }

          const resolved = constantMap.get(argNode.node.text);
          if (!resolved) {
            continue;
          }

          const varName = varNode.node.text;
          const afterNode = assignNode?.node || varNode.node;
          this.findIfChainsForVar(
            tree.rootNode,
            varName,
            resolved,
            afterNode,
            branches,
          );
          this.findSwitchForVar(
            tree.rootNode,
            varName,
            resolved,
            afterNode,
            branches,
          );
        }
      }
    }

    // 1b. Find bare function call assignments: const x = useFeatureFlag("key")
    const bareFlagFunctions = new Set([
      ...this.config.additionalFlagFunctions,
      "useFeatureFlag",
      "useFeatureFlagPayload",
      "useFeatureFlagVariantKey",
    ]);
    if (bareFlagFunctions.size > 0 && family.queries.bareFunctionCalls) {
      const bareAssignQueryStr =
        family.queries.pythonCaptureCalls !== undefined
          ? // Python: bare function assignment
            `(expression_statement
                    (assignment
                        left: (identifier) @var_name
                        right: (call
                            function: (identifier) @func_name
                            arguments: (argument_list . (string (string_content) @flag_key))))) @assignment`
          : // JS: const/let/var bare function assignment
            `(lexical_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (identifier) @func_name
                            arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment

                (variable_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (identifier) @func_name
                            arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment`;
      const bareAssignQuery = this.getQuery(lang, bareAssignQueryStr);
      if (bareAssignQuery) {
        const matches = bareAssignQuery.matches(tree.rootNode);
        for (const match of matches) {
          const varNode = match.captures.find((c) => c.name === "var_name");
          const funcNode = match.captures.find((c) => c.name === "func_name");
          const keyNode = match.captures.find((c) => c.name === "flag_key");
          const assignNode = match.captures.find(
            (c) => c.name === "assignment",
          );

          if (!varNode || !funcNode || !keyNode) {
            continue;
          }
          if (!bareFlagFunctions.has(funcNode.node.text)) {
            continue;
          }

          const varName = varNode.node.text;
          const flagKey = this.cleanStringValue(keyNode.node.text);
          const afterNode = assignNode?.node || varNode.node;

          this.findIfChainsForVar(
            tree.rootNode,
            varName,
            flagKey,
            afterNode,
            branches,
          );
          this.findSwitchForVar(
            tree.rootNode,
            varName,
            flagKey,
            afterNode,
            branches,
          );
        }
      }
    }

    // 2. Find inline flag checks: if (posthog.getFeatureFlag("key") === "variant")
    this.findInlineFlagIfs(tree.rootNode, allClients, family, branches);

    // 3. Find isFeatureEnabled checks: if (posthog.isFeatureEnabled("key"))
    this.findEnabledIfs(tree.rootNode, allClients, family, branches);

    return branches;
  }

  async findFlagAssignments(
    source: string,
    languageId: string,
  ): Promise<FlagAssignment[]> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return [];
    }

    const { lang, family } = ready;
    const tree = this.parse(source, lang);
    if (!tree) {
      return [];
    }

    const allClients = this.getEffectiveClients();
    const { clientAliases } = this.findAliases(lang, tree, family);
    for (const a of clientAliases) {
      allClients.add(a);
    }

    const assignments: FlagAssignment[] = [];

    const assignQuery = this.getQuery(lang, family.queries.flagAssignments);
    if (assignQuery) {
      const matches = assignQuery.matches(tree.rootNode);
      for (const match of matches) {
        const varNode = match.captures.find((c) => c.name === "var_name");
        const clientNode = match.captures.find((c) => c.name === "client");
        const methodNode = match.captures.find((c) => c.name === "method");
        const keyNode = match.captures.find((c) => c.name === "flag_key");

        if (!varNode || !clientNode || !methodNode || !keyNode) {
          continue;
        }
        const varClientName = this.extractClientName(clientNode.node);
        if (!varClientName || !allClients.has(varClientName)) {
          continue;
        }

        const method = methodNode.node.text;
        if (!family.flagMethods.has(method)) {
          continue;
        }

        // Check if there's already a type annotation by looking at the parent
        // In TS: `const flag: boolean = ...` — the variable_declarator has a type_annotation child
        const declarator = varNode.node.parent;
        const hasTypeAnnotation = declarator
          ? declarator.namedChildren.some((c) => c.type === "type_annotation")
          : false;

        assignments.push({
          varName: varNode.node.text,
          method,
          flagKey: this.cleanStringValue(keyNode.node.text),
          line: varNode.node.startPosition.row,
          varNameEndCol: varNode.node.endPosition.column,
          hasTypeAnnotation,
        });
      }
    }

    return assignments;
  }

  async getCompletionContext(
    source: string,
    languageId: string,
    position: Position,
  ): Promise<CompletionContext | null> {
    const ready = await this.ensureReady(languageId);
    if (!ready) {
      return null;
    }

    const { lang, family } = ready;
    const tree = this.parse(source, lang);
    if (!tree) {
      return null;
    }

    const allClients = this.getEffectiveClients();
    const { clientAliases } = this.findAliases(lang, tree, family);
    for (const a of clientAliases) {
      allClients.add(a);
    }

    const node = tree.rootNode.descendantForPosition({
      row: position.line,
      column: position.column,
    });

    // Walk up the tree to find if we're inside a PostHog call's arguments
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === "arguments" || current.type === "argument_list") {
        const callNode = current.parent;
        if (!callNode) {
          current = current.parent;
          continue;
        }

        let clientName: string | undefined;
        let methodName: string | undefined;

        const func = callNode.childForFieldName("function");
        if (func) {
          // JS/Python/Go: function field wraps object.method
          if (
            func.type === "member_expression" ||
            func.type === "attribute" ||
            func.type === "selector_expression"
          ) {
            const obj =
              func.childForFieldName("object") ||
              func.childForFieldName("operand");
            const prop =
              func.childForFieldName("property") ||
              func.childForFieldName("attribute") ||
              func.childForFieldName("field");
            clientName = obj
              ? (this.extractClientName(obj) ?? undefined)
              : undefined;
            methodName = prop?.text;
          }
        } else {
          // Ruby: call has receiver + method as separate fields (no function field)
          const receiver = callNode.childForFieldName("receiver");
          const method = callNode.childForFieldName("method");
          if (receiver && method) {
            clientName = this.extractClientName(receiver) ?? undefined;
            methodName = method.text;
          }
        }

        if (!clientName || !methodName || !allClients.has(clientName)) {
          current = current.parent;
          continue;
        }

        const args = current.namedChildren;
        const argIndex = args.findIndex(
          (a) =>
            position.line >= a.startPosition.row &&
            position.line <= a.endPosition.row &&
            (position.line > a.startPosition.row ||
              position.column >= a.startPosition.column) &&
            (position.line < a.endPosition.row ||
              position.column <= a.endPosition.column),
        );

        // Python capture: event is at argIndex 1 (distinct_id, event, ...)
        // Also handle keyword argument: capture(distinct_id='x', event='y')
        const isPythonCapture =
          family.queries.pythonCaptureCalls !== undefined &&
          family.captureMethods.has(methodName);

        if (isPythonCapture) {
          // Check if cursor is in a keyword_argument with name 'event'
          let kwNode: Parser.SyntaxNode | null = node;
          while (kwNode && kwNode !== current) {
            if (kwNode.type === "keyword_argument") {
              const nameN = kwNode.childForFieldName("name");
              if (nameN?.text === "event") {
                return { type: "capture_event" };
              }
            }
            kwNode = kwNode.parent;
          }
          // Positional: event is 2nd arg (index 1)
          if (argIndex === 1) {
            return { type: "capture_event" };
          }
        } else if (
          family.queries.rubyCaptureCalls &&
          family.captureMethods.has(methodName)
        ) {
          // Ruby capture: event is in the `event:` keyword arg (pair with hash_key_symbol)
          let kwNode: Parser.SyntaxNode | null = node;
          while (kwNode && kwNode !== current) {
            if (kwNode.type === "pair") {
              const keyN = kwNode.namedChildren[0];
              if (keyN?.type === "hash_key_symbol" && keyN.text === "event") {
                return { type: "capture_event" };
              }
            }
            kwNode = kwNode.parent;
          }
        } else if (family.captureMethods.has(methodName) && argIndex <= 0) {
          // JS/Node: event is the first argument
          return { type: "capture_event" };
        }

        if (family.flagMethods.has(methodName) && argIndex <= 0) {
          return { type: "flag_key" };
        }

        // We're in the properties argument of a capture call
        if (family.captureMethods.has(methodName)) {
          const propsArgIndex = isPythonCapture ? 2 : 1;
          const eventArgIndex = isPythonCapture ? 1 : 0;
          if (argIndex === propsArgIndex && args[eventArgIndex]) {
            const eventName = this.extractStringFromNode(args[eventArgIndex]);
            if (eventName) {
              // Determine key vs value position
              const propCtx = this.detectPropertyPosition(node, position);
              if (propCtx.mode === "value" && propCtx.propertyName) {
                return {
                  type: "property_value",
                  eventName,
                  propertyName: propCtx.propertyName,
                };
              }
              return { type: "property_key", eventName };
            }
          }
        }

        return null;
      }
      current = current.parent;
    }

    // Check for additional bare flag functions: useFeatureFlag("key"), etc.
    if (this.config.additionalFlagFunctions.length > 0) {
      const additionalFlagFuncs = new Set(this.config.additionalFlagFunctions);
      let cur: Parser.SyntaxNode | null = node;
      while (cur) {
        if (cur.type === "arguments" || cur.type === "argument_list") {
          const callNode = cur.parent;
          if (!callNode) {
            cur = cur.parent;
            continue;
          }

          const func = callNode.childForFieldName("function");
          if (
            func?.type === "identifier" &&
            additionalFlagFuncs.has(func.text)
          ) {
            const args = cur.namedChildren;
            const argIndex = args.findIndex(
              (a) =>
                position.line >= a.startPosition.row &&
                position.line <= a.endPosition.row &&
                (position.line > a.startPosition.row ||
                  position.column >= a.startPosition.column) &&
                (position.line < a.endPosition.row ||
                  position.column <= a.endPosition.column),
            );
            if (argIndex <= 0) {
              return { type: "flag_key" };
            }
          }
        }
        cur = cur.parent;
      }
    }

    return null;
  }

  // ── Variant detection helpers ──

  private findIfChainsForVar(
    _root: Parser.SyntaxNode,
    varName: string,
    flagKey: string,
    afterNode: Parser.SyntaxNode,
    branches: VariantBranch[],
  ): void {
    // Find the containing scope
    const scope = afterNode.parent;
    if (!scope) {
      return;
    }

    let foundAssignment = false;
    for (const child of scope.namedChildren) {
      if (
        child.startIndex >= afterNode.startIndex &&
        child.endIndex >= afterNode.endIndex
      ) {
        foundAssignment = true;
      }
      if (!foundAssignment) {
        continue;
      }
      if (child === afterNode) {
        continue;
      }

      // JS/Go: if_statement, Ruby: if
      if (child.type === "if_statement" || child.type === "if") {
        this.extractIfChainBranches(child, varName, flagKey, branches);
      }
    }
  }

  private extractIfChainBranches(
    ifNode: Parser.SyntaxNode,
    varName: string,
    flagKey: string,
    branches: VariantBranch[],
  ): void {
    const condition = ifNode.childForFieldName("condition");
    const consequence = ifNode.childForFieldName("consequence");
    const alternative = ifNode.childForFieldName("alternative");

    if (!condition || !consequence) {
      return;
    }

    // Only process if the condition actually references the tracked variable
    if (
      !new RegExp(
        `\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(condition.text)
    ) {
      return;
    }

    let variant = this.extractComparison(condition, varName);

    // Truthiness check: if (varName) or if (!varName)
    if (variant === null) {
      const isTruthinessCheck = this.isTruthinessCheckForVar(
        condition,
        varName,
      );
      if (isTruthinessCheck) {
        const negated = this.isNegated(condition);
        variant = negated ? "false" : "true";
      }
    }

    if (variant === null) {
      return;
    }

    branches.push({
      flagKey,
      variantKey: variant,
      conditionLine: ifNode.startPosition.row,
      startLine: ifNode.startPosition.row,
      endLine: consequence.endPosition.row,
    });

    if (alternative) {
      // Python: elif_clause, Ruby: elsif — has condition, consequence, alternative
      if (alternative.type === "elif_clause" || alternative.type === "elsif") {
        this.extractIfChainBranches(alternative, varName, flagKey, branches);
      } else if (alternative.type === "else_clause") {
        // JS else_clause may wrap an if_statement (else if). Recurse if so.
        // Otherwise treat as terminal else (Python: body field; JS: statement_block).
        const innerIf = alternative.namedChildren.find(
          (c) => c.type === "if_statement",
        );
        if (innerIf) {
          this.extractIfChainBranches(innerIf, varName, flagKey, branches);
        } else {
          const body =
            alternative.childForFieldName("body") ||
            alternative.namedChildren[0];
          if (body) {
            const elseVariant =
              variant === "true"
                ? "false"
                : variant === "false"
                  ? "true"
                  : "else";
            branches.push({
              flagKey,
              variantKey: elseVariant,
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: body.endPosition.row,
            });
          }
        }
      } else if (alternative.type === "if_statement") {
        // Go: else if — alternative is directly an if_statement
        this.extractIfChainBranches(alternative, varName, flagKey, branches);
      } else if (alternative.type === "block") {
        // Go: else { ... } — alternative is directly a block
        const elseVariant =
          variant === "true" ? "false" : variant === "false" ? "true" : "else";
        branches.push({
          flagKey,
          variantKey: elseVariant,
          conditionLine: alternative.startPosition.row,
          startLine: alternative.startPosition.row,
          endLine: alternative.endPosition.row,
        });
      } else if (alternative.type === "else") {
        // Ruby: else — children are direct statements (no body field)
        const lastChild =
          alternative.namedChildren[alternative.namedChildren.length - 1] ||
          alternative;
        const elseVariant =
          variant === "true" ? "false" : variant === "false" ? "true" : "else";
        branches.push({
          flagKey,
          variantKey: elseVariant,
          conditionLine: alternative.startPosition.row,
          startLine: alternative.startPosition.row,
          endLine: lastChild.endPosition.row,
        });
      }
    }
  }

  private findSwitchForVar(
    _root: Parser.SyntaxNode,
    varName: string,
    flagKey: string,
    afterNode: Parser.SyntaxNode,
    branches: VariantBranch[],
  ): void {
    const scope = afterNode.parent;
    if (!scope) {
      return;
    }

    let foundAssignment = false;
    for (const child of scope.namedChildren) {
      if (child.startIndex >= afterNode.startIndex) {
        foundAssignment = true;
      }
      if (!foundAssignment || child === afterNode) {
        continue;
      }

      // JS/TS: switch_statement, Go: expression_switch_statement
      if (
        child.type === "switch_statement" ||
        child.type === "expression_switch_statement"
      ) {
        const value = child.childForFieldName("value");
        if (!value) {
          continue;
        }

        // Check if switch is on our variable
        const switchedVar = this.extractIdentifier(value);
        if (switchedVar !== varName) {
          continue;
        }

        // JS/TS: cases are inside a 'body' (switch_body) node
        // Go: cases are direct children of the switch node
        const caseContainer = child.childForFieldName("body") || child;

        for (const caseNode of caseContainer.namedChildren) {
          // JS/TS: switch_case, Go: expression_case
          if (
            caseNode.type === "switch_case" ||
            caseNode.type === "expression_case"
          ) {
            const caseValue = caseNode.childForFieldName("value");
            const variantKey = caseValue
              ? this.extractStringFromCaseValue(caseValue)
              : null;

            // Get the body range: from case line to before next case or end of switch
            const nextSibling = caseNode.nextNamedSibling;
            const endLine = nextSibling
              ? nextSibling.startPosition.row - 1
              : caseContainer.endPosition.row - 1;

            branches.push({
              flagKey,
              variantKey: variantKey || "default",
              conditionLine: caseNode.startPosition.row,
              startLine: caseNode.startPosition.row,
              endLine,
            });
            // JS/TS: switch_default, Go: default_case
          } else if (
            caseNode.type === "switch_default" ||
            caseNode.type === "default_case"
          ) {
            const nextSibling = caseNode.nextNamedSibling;
            const endLine = nextSibling
              ? nextSibling.startPosition.row - 1
              : caseContainer.endPosition.row - 1;

            branches.push({
              flagKey,
              variantKey: "default",
              conditionLine: caseNode.startPosition.row,
              startLine: caseNode.startPosition.row,
              endLine,
            });
          }
        }
      }

      // Ruby: case/when/else
      if (child.type === "case") {
        const value = child.namedChildren[0]; // First named child is the matched expression
        if (!value || value.type === "when") {
          continue;
        } // case without value

        const switchedVar = this.extractIdentifier(value);
        if (switchedVar !== varName) {
          continue;
        }

        for (const caseChild of child.namedChildren) {
          if (caseChild.type === "when") {
            // when has pattern children and a body (then)
            const patterns = caseChild.namedChildren.filter(
              (c) => c.type === "pattern",
            );
            const body = caseChild.childForFieldName("body");
            const firstPattern = patterns[0];
            const patternStr = firstPattern?.namedChildren[0];
            const variantKey = patternStr
              ? this.extractStringFromNode(patternStr)
              : null;

            const endLine = body
              ? body.endPosition.row
              : caseChild.endPosition.row;

            branches.push({
              flagKey,
              variantKey: variantKey || "default",
              conditionLine: caseChild.startPosition.row,
              startLine: caseChild.startPosition.row,
              endLine,
            });
          } else if (caseChild.type === "else") {
            const lastChild =
              caseChild.namedChildren[caseChild.namedChildren.length - 1] ||
              caseChild;
            branches.push({
              flagKey,
              variantKey: "default",
              conditionLine: caseChild.startPosition.row,
              startLine: caseChild.startPosition.row,
              endLine: lastChild.endPosition.row,
            });
          }
        }
      }
    }
  }

  private findInlineFlagIfs(
    root: Parser.SyntaxNode,
    clients: Set<string>,
    family: LangFamily,
    branches: VariantBranch[],
  ): void {
    // Walk all if_statements (JS/Go) and if nodes (Ruby) for inline flag comparisons
    const ifTypes = ["if_statement", "if"];
    for (const ifType of ifTypes) {
      this.walkNodes(root, ifType, (ifNode) => {
        const condition = ifNode.childForFieldName("condition");
        const consequence = ifNode.childForFieldName("consequence");
        if (!condition || !consequence) {
          return;
        }

        // Look for: getFeatureFlag("key") === "variant"
        const callInfo = this.extractFlagCallComparison(
          condition,
          clients,
          family,
        );
        if (!callInfo) {
          return;
        }

        branches.push({
          flagKey: callInfo.flagKey,
          variantKey: callInfo.variant,
          conditionLine: ifNode.startPosition.row,
          startLine: ifNode.startPosition.row,
          endLine: consequence.endPosition.row,
        });

        // Process else chain
        const alternative = ifNode.childForFieldName("alternative");
        if (alternative) {
          // Python: elif_clause, Ruby: elsif
          if (
            alternative.type === "elif_clause" ||
            alternative.type === "elsif"
          ) {
            // walkNodes will find it via recursive walking
          } else if (alternative.type === "else_clause") {
            // JS else_clause may wrap another if_statement (else if).
            // Skip the else label in that case — walkNodes will visit the inner if.
            const innerIf = alternative.namedChildren.find(
              (c) => c.type === "if_statement",
            );
            if (!innerIf) {
              const body =
                alternative.childForFieldName("body") ||
                alternative.namedChildren[0];
              if (body) {
                branches.push({
                  flagKey: callInfo.flagKey,
                  variantKey: "else",
                  conditionLine: alternative.startPosition.row,
                  startLine: alternative.startPosition.row,
                  endLine: body.endPosition.row,
                });
              }
            }
          } else if (alternative.type === "if_statement") {
            // Go: else if — alternative is directly an if_statement (handled by walkNodes)
          } else if (alternative.type === "block") {
            // Go: else { ... } — alternative is directly a block
            branches.push({
              flagKey: callInfo.flagKey,
              variantKey: "else",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: alternative.endPosition.row,
            });
          } else if (alternative.type === "else") {
            // Ruby: else — children are direct statements
            const lastChild =
              alternative.namedChildren[alternative.namedChildren.length - 1] ||
              alternative;
            branches.push({
              flagKey: callInfo.flagKey,
              variantKey: "else",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: lastChild.endPosition.row,
            });
          }
        }
      });
    }

    // Python: also walk elif_clause nodes for inline flag comparisons
    this.walkNodes(root, "elif_clause", (elifNode) => {
      const condition = elifNode.childForFieldName("condition");
      const consequence = elifNode.childForFieldName("consequence");
      if (!condition || !consequence) {
        return;
      }

      const callInfo = this.extractFlagCallComparison(
        condition,
        clients,
        family,
      );
      if (!callInfo) {
        return;
      }

      branches.push({
        flagKey: callInfo.flagKey,
        variantKey: callInfo.variant,
        conditionLine: elifNode.startPosition.row,
        startLine: elifNode.startPosition.row,
        endLine: consequence.endPosition.row,
      });

      const alternative = elifNode.childForFieldName("alternative");
      if (alternative) {
        if (alternative.type === "else_clause") {
          const body =
            alternative.childForFieldName("body") ||
            alternative.namedChildren[0];
          if (body) {
            branches.push({
              flagKey: callInfo.flagKey,
              variantKey: "else",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: body.endPosition.row,
            });
          }
        }
        // elif_clause chaining: will be handled by walking all elif_clause nodes
      }
    });
  }

  private findEnabledIfs(
    root: Parser.SyntaxNode,
    clients: Set<string>,
    family: LangFamily,
    branches: VariantBranch[],
  ): void {
    const enabledIfTypes = ["if_statement", "if"];
    for (const ifType of enabledIfTypes) {
      this.walkNodes(root, ifType, (ifNode) => {
        const condition = ifNode.childForFieldName("condition");
        const consequence = ifNode.childForFieldName("consequence");
        if (!condition || !consequence) {
          return;
        }

        const flagKey = this.extractEnabledCall(condition, clients, family);
        if (!flagKey) {
          return;
        }

        // Check for negation
        const negated = this.isNegated(condition);

        branches.push({
          flagKey,
          variantKey: negated ? "false" : "true",
          conditionLine: ifNode.startPosition.row,
          startLine: ifNode.startPosition.row,
          endLine: consequence.endPosition.row,
        });

        const alternative = ifNode.childForFieldName("alternative");
        if (alternative) {
          // Python: elif_clause, Ruby: elsif
          if (
            alternative.type === "elif_clause" ||
            alternative.type === "elsif"
          ) {
            // Handled by walk below
          } else if (alternative.type === "else_clause") {
            // JS else_clause may wrap another if_statement (else if).
            // Skip the else label in that case — walkNodes will visit the inner if.
            const innerIf = alternative.namedChildren.find(
              (c) => c.type === "if_statement",
            );
            if (!innerIf) {
              const body =
                alternative.childForFieldName("body") ||
                alternative.namedChildren[0];
              if (body) {
                branches.push({
                  flagKey,
                  variantKey: negated ? "true" : "false",
                  conditionLine: alternative.startPosition.row,
                  startLine: alternative.startPosition.row,
                  endLine: body.endPosition.row,
                });
              }
            }
          } else if (alternative.type === "block") {
            // Go: else { ... } — alternative is directly a block
            branches.push({
              flagKey,
              variantKey: negated ? "true" : "false",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: alternative.endPosition.row,
            });
          } else if (alternative.type === "else") {
            // Ruby: else — children are direct statements
            const lastChild =
              alternative.namedChildren[alternative.namedChildren.length - 1] ||
              alternative;
            branches.push({
              flagKey,
              variantKey: negated ? "true" : "false",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: lastChild.endPosition.row,
            });
          }
        }
      });
    }

    // Python/Ruby: also walk elif_clause/elsif nodes for enabled checks
    const elifTypes = ["elif_clause", "elsif"];
    for (const elifType of elifTypes) {
      this.walkNodes(root, elifType, (elifNode) => {
        const condition = elifNode.childForFieldName("condition");
        const consequence = elifNode.childForFieldName("consequence");
        if (!condition || !consequence) {
          return;
        }

        const flagKey = this.extractEnabledCall(condition, clients, family);
        if (!flagKey) {
          return;
        }

        const negated = this.isNegated(condition);

        branches.push({
          flagKey,
          variantKey: negated ? "false" : "true",
          conditionLine: elifNode.startPosition.row,
          startLine: elifNode.startPosition.row,
          endLine: consequence.endPosition.row,
        });

        const alternative = elifNode.childForFieldName("alternative");
        if (alternative) {
          if (alternative.type === "else_clause") {
            const body =
              alternative.childForFieldName("body") ||
              alternative.namedChildren[0];
            if (body) {
              branches.push({
                flagKey,
                variantKey: negated ? "true" : "false",
                conditionLine: alternative.startPosition.row,
                startLine: alternative.startPosition.row,
                endLine: body.endPosition.row,
              });
            }
          } else if (alternative.type === "else") {
            // Ruby: else
            const lastChild =
              alternative.namedChildren[alternative.namedChildren.length - 1] ||
              alternative;
            branches.push({
              flagKey,
              variantKey: negated ? "true" : "false",
              conditionLine: alternative.startPosition.row,
              startLine: alternative.startPosition.row,
              endLine: lastChild.endPosition.row,
            });
          }
        }
      });
    }
  }

  // ── Node extraction helpers ──

  private extractComparison(
    conditionNode: Parser.SyntaxNode,
    varName: string,
  ): string | null {
    // Unwrap parenthesized_expression
    let node = conditionNode;
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }

    // JS/Go: binary_expression, Ruby: binary
    if (node.type === "binary_expression" || node.type === "binary") {
      const left = node.childForFieldName("left");
      const right = node.childForFieldName("right");
      const op = node.childForFieldName("operator");

      if (!left || !right) {
        return null;
      }

      const opText = op?.text || "";
      if (
        opText !== "===" &&
        opText !== "==" &&
        opText !== "!==" &&
        opText !== "!="
      ) {
        return null;
      }

      if (left.text === varName) {
        return this.extractStringFromNode(right);
      }
      if (right.text === varName) {
        return this.extractStringFromNode(left);
      }
    }

    // Python: comparison_operator (e.g. `flag == "variant"`)
    if (node.type === "comparison_operator") {
      const children = node.namedChildren;
      // comparison_operator has: left_operand, operator(s), right_operand(s)
      // For simple `a == b`, children are [a, b] with operator tokens between
      if (children.length >= 2) {
        const left = children[0];
        const right = children[children.length - 1];
        // Check the operator text between operands
        const fullText = node.text;
        if (fullText.includes("==") || fullText.includes("!=")) {
          if (left.text === varName) {
            return this.extractStringFromNode(right);
          }
          if (right.text === varName) {
            return this.extractStringFromNode(left);
          }
        }
      }
    }

    return null;
  }

  private extractFlagCallComparison(
    conditionNode: Parser.SyntaxNode,
    clients: Set<string>,
    family: LangFamily,
  ): { flagKey: string; variant: string } | null {
    let node = conditionNode;
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }

    let left: Parser.SyntaxNode | null = null;
    let right: Parser.SyntaxNode | null = null;

    // JS/Go: binary_expression, Ruby: binary, Python: comparison_operator
    if (node.type === "binary_expression" || node.type === "binary") {
      left = node.childForFieldName("left");
      right = node.childForFieldName("right");
    } else if (node.type === "comparison_operator") {
      // Python: comparison_operator children are [left_operand, right_operand]
      const children = node.namedChildren;
      if (children.length >= 2) {
        left = children[0];
        right = children[children.length - 1];
      }
    }

    if (!left || !right) {
      return null;
    }

    // Check if left is a posthog.getFeatureFlag("key") call
    const callTypes = new Set(["call_expression", "call"]);
    const callNode = callTypes.has(left.type)
      ? left
      : callTypes.has(right.type)
        ? right
        : null;
    const valueNode = callNode === left ? right : left;
    if (!callNode || !valueNode) {
      return null;
    }

    let obj: Parser.SyntaxNode | null = null;
    let prop: Parser.SyntaxNode | null = null;

    const func = callNode.childForFieldName("function");
    if (
      func &&
      (func.type === "member_expression" ||
        func.type === "attribute" ||
        func.type === "selector_expression")
    ) {
      obj =
        func.childForFieldName("object") || func.childForFieldName("operand");
      prop =
        func.childForFieldName("property") ||
        func.childForFieldName("attribute") ||
        func.childForFieldName("field");
    } else {
      // Ruby: call has receiver + method as separate fields
      obj = callNode.childForFieldName("receiver");
      prop = callNode.childForFieldName("method");
    }
    if (!obj || !prop) {
      return null;
    }
    const extractedClient = this.extractClientName(obj);
    if (!extractedClient || !clients.has(extractedClient)) {
      return null;
    }

    const method = prop.text;
    // Only match getFeatureFlag-like methods (not isFeatureEnabled which returns bool)
    const flagGetters = new Set(
      [...family.flagMethods].filter(
        (m) =>
          m.toLowerCase().includes("get") || m.toLowerCase().includes("flag"),
      ),
    );
    if (!flagGetters.has(method)) {
      return null;
    }

    const args = callNode.childForFieldName("arguments");
    if (!args) {
      return null;
    }
    const firstArg = args.namedChildren[0];
    if (!firstArg) {
      return null;
    }

    const flagKey = this.extractStringFromNode(firstArg);
    const variant = this.extractStringFromNode(valueNode);
    if (!flagKey || !variant) {
      return null;
    }

    return { flagKey, variant };
  }

  private extractEnabledCall(
    conditionNode: Parser.SyntaxNode,
    clients: Set<string>,
    family: LangFamily,
  ): string | null {
    let node = conditionNode;
    // Unwrap parenthesized_expression and unary ! (negation)
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }
    // JS: unary_expression, Python: not_operator, Ruby: unary
    if (
      node.type === "unary_expression" ||
      node.type === "not_operator" ||
      node.type === "unary"
    ) {
      const operand =
        node.childForFieldName("operand") ||
        node.namedChildren[node.namedChildren.length - 1];
      if (operand) {
        node = operand;
      }
    }
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }

    if (node.type !== "call_expression" && node.type !== "call") {
      return null;
    }

    let clientName: string | undefined;
    let methodName: string | undefined;

    const func = node.childForFieldName("function");
    if (func) {
      if (
        func.type === "member_expression" ||
        func.type === "attribute" ||
        func.type === "selector_expression"
      ) {
        const obj =
          func.childForFieldName("object") || func.childForFieldName("operand");
        const prop =
          func.childForFieldName("property") ||
          func.childForFieldName("attribute") ||
          func.childForFieldName("field");
        clientName = obj
          ? (this.extractClientName(obj) ?? undefined)
          : undefined;
        methodName = prop?.text;
      }
    } else {
      // Ruby: call has receiver + method as separate fields
      const receiver = node.childForFieldName("receiver");
      const method = node.childForFieldName("method");
      if (receiver && method) {
        clientName = this.extractClientName(receiver) ?? undefined;
        methodName = method.text;
      }
    }

    if (!clientName || !methodName || !clients.has(clientName)) {
      return null;
    }

    // Match isFeatureEnabled-like methods
    const enabledMethods = new Set(
      [...family.flagMethods].filter(
        (m) =>
          m.toLowerCase().includes("enabled") ||
          m.toLowerCase().includes("is_feature"),
      ),
    );
    if (!enabledMethods.has(methodName)) {
      return null;
    }

    const args = node.childForFieldName("arguments");
    if (!args) {
      return null;
    }
    const firstArg = args.namedChildren[0];
    return firstArg ? this.extractStringFromNode(firstArg) : null;
  }

  private isNegated(conditionNode: Parser.SyntaxNode): boolean {
    let node = conditionNode;
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }
    // JS: unary_expression, Python: not_operator, Ruby: unary
    return (
      (node.type === "unary_expression" && node.text.startsWith("!")) ||
      node.type === "not_operator" ||
      (node.type === "unary" && node.text.startsWith("!"))
    );
  }

  /** Check if a condition is a simple truthiness check on a variable: `if (varName)` or `if (!varName)` */
  private isTruthinessCheckForVar(
    conditionNode: Parser.SyntaxNode,
    varName: string,
  ): boolean {
    let node = conditionNode;
    while (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      node = node.namedChildren[0];
    }
    // if (varName)
    if (node.type === "identifier" && node.text === varName) {
      return true;
    }
    // if (!varName) — JS: unary_expression, Python: not_operator, Ruby: unary
    if (
      (node.type === "unary_expression" ||
        node.type === "not_operator" ||
        node.type === "unary") &&
      node.namedChildren.length > 0
    ) {
      let inner = node.namedChildren[node.namedChildren.length - 1];
      while (
        inner.type === "parenthesized_expression" &&
        inner.namedChildren.length === 1
      ) {
        inner = inner.namedChildren[0];
      }
      if (inner.type === "identifier" && inner.text === varName) {
        return true;
      }
    }
    return false;
  }

  /** Build a map of const/let/var identifier → string value from the file */
  private buildConstantMap(
    lang: Parser.Language,
    tree: Parser.Tree,
  ): Map<string, string> {
    const constants = new Map<string, string>();

    // JS: const/let/var declarations
    const jsQuery = this.getQuery(
      lang,
      `
            (lexical_declaration
                (variable_declarator
                    name: (identifier) @name
                    value: (string (string_fragment) @value)))

            (variable_declaration
                (variable_declarator
                    name: (identifier) @name
                    value: (string (string_fragment) @value)))
        `,
    );
    if (jsQuery) {
      const matches = jsQuery.matches(tree.rootNode);
      for (const match of matches) {
        const nameNode = match.captures.find((c) => c.name === "name");
        const valueNode = match.captures.find((c) => c.name === "value");
        if (nameNode && valueNode) {
          constants.set(nameNode.node.text, valueNode.node.text);
        }
      }
    }

    // Python: simple assignment — NAME = "value"
    const pyQuery = this.getQuery(
      lang,
      `
            (expression_statement
                (assignment
                    left: (identifier) @name
                    right: (string (string_content) @value)))
        `,
    );
    if (pyQuery) {
      const matches = pyQuery.matches(tree.rootNode);
      for (const match of matches) {
        const nameNode = match.captures.find((c) => c.name === "name");
        const valueNode = match.captures.find((c) => c.name === "value");
        if (nameNode && valueNode) {
          constants.set(nameNode.node.text, valueNode.node.text);
        }
      }
    }

    // Go: short var declarations and const declarations
    const goVarQuery = this.getQuery(
      lang,
      `
            (short_var_declaration
                left: (expression_list (identifier) @name)
                right: (expression_list (interpreted_string_literal) @value))
        `,
    );
    if (goVarQuery) {
      const matches = goVarQuery.matches(tree.rootNode);
      for (const match of matches) {
        const nameNode = match.captures.find((c) => c.name === "name");
        const valueNode = match.captures.find((c) => c.name === "value");
        if (nameNode && valueNode) {
          constants.set(
            nameNode.node.text,
            this.cleanStringValue(valueNode.node.text),
          );
        }
      }
    }

    const goConstQuery = this.getQuery(
      lang,
      `
            (const_declaration
                (const_spec
                    name: (identifier) @name
                    value: (expression_list (interpreted_string_literal) @value)))
        `,
    );
    if (goConstQuery) {
      const matches = goConstQuery.matches(tree.rootNode);
      for (const match of matches) {
        const nameNode = match.captures.find((c) => c.name === "name");
        const valueNode = match.captures.find((c) => c.name === "value");
        if (nameNode && valueNode) {
          constants.set(
            nameNode.node.text,
            this.cleanStringValue(valueNode.node.text),
          );
        }
      }
    }

    // Ruby: assignment — local var: name = "value", constant: NAME = "value"
    const rbQuery = this.getQuery(
      lang,
      `
            (assignment
                left: (identifier) @name
                right: (string (string_content) @value))

            (assignment
                left: (constant) @name
                right: (string (string_content) @value))
        `,
    );
    if (rbQuery) {
      const matches = rbQuery.matches(tree.rootNode);
      for (const match of matches) {
        const nameNode = match.captures.find((c) => c.name === "name");
        const valueNode = match.captures.find((c) => c.name === "value");
        if (nameNode && valueNode) {
          constants.set(nameNode.node.text, valueNode.node.text);
        }
      }
    }

    return constants;
  }

  private extractIdentifier(node: Parser.SyntaxNode): string | null {
    if (node.type === "identifier") {
      return node.text;
    }
    // Unwrap parenthesized
    if (
      node.type === "parenthesized_expression" &&
      node.namedChildren.length === 1
    ) {
      return this.extractIdentifier(node.namedChildren[0]);
    }
    return null;
  }

  // Extract string from a switch case value node (handles Go's expression_list wrapper)
  private extractStringFromCaseValue(node: Parser.SyntaxNode): string | null {
    // Go: case value is an expression_list containing the actual string literal
    if (node.type === "expression_list" && node.namedChildCount > 0) {
      return this.extractStringFromNode(node.namedChildren[0]);
    }
    return this.extractStringFromNode(node);
  }

  private extractStringFromNode(node: Parser.SyntaxNode): string | null {
    if (node.type === "string" || node.type === "template_string") {
      const content = node.namedChildren.find(
        (c) =>
          c.type === "string_fragment" ||
          c.type === "string_content" ||
          c.type === "string_value",
      );
      return content ? content.text : null;
    }
    // Go: interpreted_string_literal includes quotes
    if (
      node.type === "interpreted_string_literal" ||
      node.type === "raw_string_literal"
    ) {
      return node.text.slice(1, -1);
    }
    // For simple string fragments already extracted
    if (node.type === "string_fragment" || node.type === "string_content") {
      return node.text;
    }
    return null;
  }

  private cleanStringValue(text: string): string {
    // Strip surrounding quotes if present
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith("`") && text.endsWith("`"))
    ) {
      return text.slice(1, -1);
    }
    return text;
  }

  private extractParams(paramsText: string): string[] {
    // Remove surrounding parens
    let text = paramsText.trim();
    if (text.startsWith("(")) {
      text = text.slice(1);
    }
    if (text.endsWith(")")) {
      text = text.slice(0, -1);
    }
    if (!text.trim()) {
      return [];
    }

    const SKIP = new Set([
      "e",
      "ev",
      "event",
      "evt",
      "ctx",
      "context",
      "req",
      "res",
      "next",
      "err",
      "error",
      "_",
      "__",
    ]);

    return text
      .split(",")
      .map((p) => {
        if (p.includes("{") || p.includes("}")) {
          return "";
        }
        const name = p.split(":")[0].split("=")[0].replace(/[?.]/g, "").trim();
        return name;
      })
      .filter((p) => p && !SKIP.has(p) && !p.startsWith("..."));
  }

  private detectPropertyPosition(
    node: Parser.SyntaxNode,
    position: Position,
  ): { mode: "key" | "value"; propertyName?: string } {
    // Walk up to find if we're in a pair (key: value)
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === "pair") {
        const key = current.childForFieldName("key");
        const value = current.childForFieldName("value");
        if (
          value &&
          position.line >= value.startPosition.row &&
          (position.line > value.startPosition.row ||
            position.column >= value.startPosition.column)
        ) {
          return { mode: "value", propertyName: key?.text };
        }
        return { mode: "key" };
      }
      if (current.type === "object" || current.type === "object_pattern") {
        return { mode: "key" };
      }
      current = current.parent;
    }
    return { mode: "key" };
  }

  private walkNodes(
    root: Parser.SyntaxNode,
    type: string,
    callback: (node: Parser.SyntaxNode) => void,
  ): void {
    const visit = (node: Parser.SyntaxNode) => {
      if (node.type === type) {
        callback(node);
      }
      for (const child of node.namedChildren) {
        visit(child);
      }
    };
    visit(root);
  }

  dispose(): void {
    this.parser?.delete();
    this.parser = null;
    this.languages.clear();
    this.queryCache.clear();
  }
}
