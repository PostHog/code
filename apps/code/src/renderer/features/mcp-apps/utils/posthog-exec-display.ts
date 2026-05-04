/**
 * The PostHog MCP exposes a single `exec` dispatcher that runs CLI-style
 * subcommands. Generic MCP rendering would show this as
 * `posthog - exec (MCP) {"command":"call execute-sql {…}"}` — pure plumbing
 * with the dispatched action buried inside a JSON wrapper.
 *
 * These helpers pull the action out of the `command` string so the row can
 * read `posthog - execute-sql {…}` (call), `posthog - info execute-sql`,
 * `posthog - schema query-trends series`, `posthog - search query-`, or
 * `posthog - tools` instead.
 *
 * Supported verbs (per the `exec` tool description):
 *   tools                                  — list every tool
 *   search <regex>                         — search by name/title/description
 *   info <tool>                            — show description + input schema
 *   schema <tool> [field_path]             — drill into a specific field
 *   call [--json] <tool> <json_input>      — invoke a tool
 */

const POSTHOG_EXEC_TOOL_RE = /^mcp__(?:plugin_)?posthog(?:_[^_]+)*__exec$/;

const POSTHOG_VERB_RE =
  /^\s*(tools|search|info|schema|call)(?:\s+([\s\S]*))?\s*$/;
const POSTHOG_CALL_BODY_RE = /^(?:--json\s+)?([a-zA-Z0-9_-]+)\s*([\s\S]*)$/;
const POSTHOG_TOOL_NAME_RE = /^([a-zA-Z0-9_-]+)\s*([\s\S]*)$/;

export interface PostHogExecDisplay {
  /** Replaces the tool name in the title — e.g. "execute-sql", "info execute-sql". */
  label: string;
  /** Args to show as the input preview, undefined when there is none to display. */
  input?: string;
}

export function isPostHogExecTool(toolName: string): boolean {
  return POSTHOG_EXEC_TOOL_RE.test(toolName);
}

export function getPostHogExecDisplay(
  toolInput: unknown,
): PostHogExecDisplay | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const obj = toolInput as { command?: unknown; input?: unknown };

  if (typeof obj.command !== "string") return null;
  const verbMatch = obj.command.match(POSTHOG_VERB_RE);
  if (!verbMatch) return null;

  const verb = verbMatch[1] as "tools" | "search" | "info" | "schema" | "call";
  const rest = (verbMatch[2] ?? "").trim();
  const explicitInput = readExplicitInput(obj.input);

  switch (verb) {
    case "tools":
      return { label: "tools", input: undefined };

    case "search":
      return {
        label: "search",
        input: explicitInput ?? (rest.length > 0 ? rest : undefined),
      };

    case "info":
      // `info <tool>` — name the tool, no args portion.
      return rest.length > 0
        ? { label: `info ${rest}`, input: undefined }
        : { label: "info", input: undefined };

    case "schema": {
      // `schema <tool> [field_path]` — surface the tool, treat the path as args.
      const m = rest.match(POSTHOG_TOOL_NAME_RE);
      if (!m) return { label: "schema", input: undefined };
      const subTool = m[1];
      const fieldPath = (m[2] ?? "").trim();
      return {
        label: `schema ${subTool}`,
        input: explicitInput ?? (fieldPath.length > 0 ? fieldPath : undefined),
      };
    }

    case "call": {
      // `call [--json] <tool> [json_input]` — collapse the verb, surface the
      // sub-tool as the label and the JSON body as args.
      const m = rest.match(POSTHOG_CALL_BODY_RE);
      if (!m) return null;
      const subTool = m[1];
      const args = (m[2] ?? "").trim();
      return {
        label: subTool,
        input: explicitInput ?? (args.length > 0 ? args : undefined),
      };
    }
  }
}

function readExplicitInput(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
