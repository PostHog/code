import { describe, expect, it } from "vitest";
import type { StoredEntry } from "../../../types.js";
import {
  conversationTurnsToJsonlEntries,
  getSessionJsonlPath,
  rebuildConversation,
} from "./jsonl-hydration.js";

function entry(
  sessionUpdate: string,
  extra: Record<string, unknown> = {},
): StoredEntry {
  return {
    type: "notification",
    timestamp: new Date().toISOString(),
    notification: {
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate, ...extra } },
    },
  };
}

function toolEntry(
  sessionUpdate: string,
  meta: Record<string, unknown>,
): StoredEntry {
  return entry(sessionUpdate, { _meta: { claudeCode: meta } });
}

describe("getSessionJsonlPath", () => {
  it("constructs path from sessionId and cwd", () => {
    const original = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
    try {
      const result = getSessionJsonlPath("sess-123", "/home/user/project");
      expect(result).toBe(
        "/tmp/claude-test/projects/-home-user-project/sess-123.jsonl",
      );
    } finally {
      if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = original;
    }
  });

  it("handles backslashes in cwd", () => {
    const original = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
    try {
      const result = getSessionJsonlPath("sess-1", "C:\\Users\\dev\\project");
      expect(result).toContain("C:-Users-dev-project");
    } finally {
      if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = original;
    }
  });
});

describe("rebuildConversation", () => {
  it("returns empty turns for empty entries", () => {
    expect(rebuildConversation([])).toEqual([]);
  });

  it("returns empty turns for non-session/update entries", () => {
    const entries: StoredEntry[] = [
      {
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: {
          jsonrpc: "2.0",
          method: "some/other_method",
          params: {},
        },
      },
    ];
    expect(rebuildConversation(entries)).toEqual([]);
  });

  it("produces a single user turn from user_message", () => {
    const turns = rebuildConversation([
      entry("user_message", {
        content: { type: "text", text: "hello" },
      }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("user");
    expect(turns[0].content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("handles user_message with array content", () => {
    const turns = rebuildConversation([
      entry("user_message", {
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].content).toHaveLength(2);
  });

  it("coalesces consecutive agent text chunks", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "hi" } }),
      entry("agent_message_chunk", { content: { type: "text", text: "hel" } }),
      entry("agent_message_chunk", { content: { type: "text", text: "lo" } }),
      entry("agent_message_chunk", {
        content: { type: "text", text: " world" },
      }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[1].role).toBe("assistant");
    expect(turns[1].content).toHaveLength(1);
    expect(turns[1].content[0]).toEqual({
      type: "text",
      text: "hello world",
    });
  });

  it("does not coalesce non-text blocks", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "hi" } }),
      entry("agent_message", {
        content: { type: "thinking", thinking: "hmm" },
      }),
      entry("agent_message", { content: { type: "text", text: "answer" } }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[1].content).toHaveLength(2);
    expect(turns[1].content[0]).toEqual({ type: "thinking", thinking: "hmm" });
    expect(turns[1].content[1]).toEqual({ type: "text", text: "answer" });
  });

  it("produces alternating user/assistant turns for multi-round conversation", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "q1" } }),
      entry("agent_message", { content: { type: "text", text: "a1" } }),
      entry("user_message", { content: { type: "text", text: "q2" } }),
      entry("agent_message", { content: { type: "text", text: "a2" } }),
    ]);

    expect(turns).toHaveLength(4);
    expect(turns.map((t) => t.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("tracks tool calls with results", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "do it" } }),
      entry("agent_message", { content: { type: "text", text: "ok" } }),
      toolEntry("tool_call", {
        toolCallId: "tc-1",
        toolName: "Bash",
        toolInput: { command: "ls" },
      }),
      toolEntry("tool_result", {
        toolCallId: "tc-1",
        toolResponse: "file.txt",
      }),
    ]);

    expect(turns).toHaveLength(2);
    const assistant = turns[1];
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls?.[0]).toEqual({
      toolCallId: "tc-1",
      toolName: "Bash",
      input: { command: "ls" },
      result: "file.txt",
    });
  });

  it("updates tool result via tool_call_update", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "go" } }),
      toolEntry("tool_call", {
        toolCallId: "tc-1",
        toolName: "Read",
        toolInput: { path: "/a" },
      }),
      toolEntry("tool_call_update", {
        toolCallId: "tc-1",
        toolName: "Read",
        toolResponse: "contents",
      }),
    ]);

    expect(turns[1].toolCalls?.[0].result).toBe("contents");
  });

  it("flushes trailing assistant content", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "hi" } }),
      entry("agent_message", { content: { type: "text", text: "bye" } }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[1].role).toBe("assistant");
    expect(turns[1].content[0]).toEqual({ type: "text", text: "bye" });
  });

  it("flushes trailing tool calls without explicit result", () => {
    const turns = rebuildConversation([
      entry("user_message", { content: { type: "text", text: "go" } }),
      toolEntry("tool_call", {
        toolCallId: "tc-1",
        toolName: "Bash",
        toolInput: { command: "echo" },
      }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[1].toolCalls).toHaveLength(1);
    expect(turns[1].toolCalls?.[0].result).toBeUndefined();
  });
});

describe("conversationTurnsToJsonlEntries", () => {
  const config = { sessionId: "sess-1", cwd: "/repo" };

  it("returns empty array for empty turns", () => {
    expect(conversationTurnsToJsonlEntries([], config)).toEqual([]);
  });

  it("produces a user line for a user turn", () => {
    const lines = conversationTurnsToJsonlEntries(
      [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      config,
    );

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe("user");
    expect(parsed.message.role).toBe("user");
    expect(parsed.message.content).toBe("hello");
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.parentUuid).toBeNull();
  });

  it("chains parentUuid across entries", () => {
    const lines = conversationTurnsToJsonlEntries(
      [
        { role: "user", content: [{ type: "text", text: "q" }] },
        { role: "assistant", content: [{ type: "text", text: "a" }] },
      ],
      config,
    );

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    expect(first.parentUuid).toBeNull();
    expect(second.parentUuid).toBe(first.uuid);
  });

  it("emits tool_use in assistant block and tool_result as user block", () => {
    const lines = conversationTurnsToJsonlEntries(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: "running" }],
          toolCalls: [
            {
              toolCallId: "tc-1",
              toolName: "Bash",
              input: { command: "ls" },
              result: "output",
            },
          ],
        },
      ],
      config,
    );

    expect(lines).toHaveLength(2);

    const assistantEntry = JSON.parse(lines[0]);
    expect(assistantEntry.type).toBe("assistant");
    const content = assistantEntry.message.content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "running" });
    expect(content[1]).toEqual({
      type: "tool_use",
      id: "tc-1",
      name: "Bash",
      input: { command: "ls" },
    });

    const toolResultEntry = JSON.parse(lines[1]);
    expect(toolResultEntry.type).toBe("user");
    expect(toolResultEntry.message.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "tc-1",
      content: "output",
    });
    expect(toolResultEntry.parentUuid).toBe(assistantEntry.uuid);
  });

  it("skips tool results that are undefined", () => {
    const lines = conversationTurnsToJsonlEntries(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: "x" }],
          toolCalls: [
            {
              toolCallId: "tc-1",
              toolName: "Bash",
              input: {},
            },
          ],
        },
      ],
      config,
    );

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).type).toBe("assistant");
  });

  it("serializes non-string tool results as JSON", () => {
    const lines = conversationTurnsToJsonlEntries(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: "x" }],
          toolCalls: [
            {
              toolCallId: "tc-1",
              toolName: "Read",
              input: {},
              result: { files: ["a.ts"] },
            },
          ],
        },
      ],
      config,
    );

    const toolResult = JSON.parse(lines[1]);
    expect(toolResult.message.content[0].content).toBe(
      JSON.stringify({ files: ["a.ts"] }),
    );
  });

  it("falls back to space for empty user content", () => {
    const lines = conversationTurnsToJsonlEntries(
      [{ role: "user", content: [] }],
      config,
    );

    const parsed = JSON.parse(lines[0]);
    expect(parsed.message.content).toBe(" ");
  });
});

describe("end-to-end: S3 log entries -> JSONL output", () => {
  const config = { sessionId: "sess-abc", cwd: "/home/user/repo" };

  function s3Entry(
    sessionUpdate: string,
    extra: Record<string, unknown> = {},
  ): StoredEntry {
    return {
      type: "notification",
      timestamp: "2026-03-03T12:00:00.000Z",
      notification: {
        jsonrpc: "2.0",
        method: "session/update",
        params: { update: { sessionUpdate, ...extra } },
      },
    };
  }

  it("converts a multi-turn session with tool use into valid JSONL", () => {
    const s3Logs: StoredEntry[] = [
      // Turn 1: user asks to list files
      s3Entry("user_message", {
        content: { type: "text", text: "List the files in src/" },
      }),

      // Turn 1: assistant responds with thinking + text + tool call
      s3Entry("agent_message_chunk", {
        content: { type: "thinking", thinking: "I should use Bash to run ls" },
      }),
      s3Entry("agent_message_chunk", {
        content: { type: "text", text: "I'll list the files " },
      }),
      s3Entry("agent_message_chunk", {
        content: { type: "text", text: "for you." },
      }),
      s3Entry("tool_call", {
        _meta: {
          claudeCode: {
            toolCallId: "toolu_01ABC",
            toolName: "Bash",
            toolInput: { command: "ls src/" },
          },
        },
      }),
      s3Entry("tool_result", {
        _meta: {
          claudeCode: {
            toolCallId: "toolu_01ABC",
            toolResponse: "index.ts\nutils.ts\nconfig.ts",
          },
        },
      }),

      // Turn 2: assistant summarizes after seeing tool result
      s3Entry("agent_message", {
        content: {
          type: "text",
          text: "There are 3 files: index.ts, utils.ts and config.ts.",
        },
      }),

      // Turn 3: user asks follow-up
      s3Entry("user_message", {
        content: { type: "text", text: "Read index.ts" },
      }),

      // Turn 3: assistant uses Read tool
      s3Entry("agent_message_chunk", {
        content: { type: "text", text: "Reading now." },
      }),
      s3Entry("tool_call", {
        _meta: {
          claudeCode: {
            toolCallId: "toolu_02DEF",
            toolName: "Read",
            toolInput: { file_path: "/home/user/repo/src/index.ts" },
          },
        },
      }),
      s3Entry("tool_result", {
        _meta: {
          claudeCode: {
            toolCallId: "toolu_02DEF",
            toolResponse: 'export const main = () => console.log("hello");',
          },
        },
      }),

      // Turn 3: assistant summarizes
      s3Entry("agent_message", {
        content: {
          type: "text",
          text: "The file exports a main function that logs hello.",
        },
      }),
    ];

    const turns = rebuildConversation(s3Logs);
    const lines = conversationTurnsToJsonlEntries(turns, config);
    const parsed = lines.map((l) => JSON.parse(l));

    // rebuildConversation only starts a new turn on user_message,
    // so agent messages after tool results stay in the same assistant turn:
    // user("List files") -> assistant(thinking + text + Bash tool + summary text) ->
    // user("Read index.ts") -> assistant(text + Read tool + summary text)
    expect(turns).toHaveLength(4);
    expect(turns.map((t) => t.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);

    // Verify thinking block preserved in first assistant turn
    const firstAssistant = turns[1];
    const thinkingBlocks = firstAssistant.content.filter(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        "type" in b &&
        (b as { type: string }).type === "thinking",
    );
    expect(thinkingBlocks).toHaveLength(1);

    // Verify text coalescing: the streamed chunks + post-tool summary
    // all merge into one text block since they're all consecutive text type
    const textBlocks = firstAssistant.content.filter(
      (b) =>
        typeof b === "object" && b !== null && "type" in b && b.type === "text",
    );
    expect(textBlocks).toHaveLength(1);
    const firstText = (textBlocks[0] as { type: "text"; text: string }).text;
    expect(firstText).toContain("I'll list the files for you.");
    expect(firstText).toContain("There are 3 files");

    // Verify tool calls were tracked
    expect(firstAssistant.toolCalls).toHaveLength(1);
    expect(firstAssistant.toolCalls?.[0].toolName).toBe("Bash");
    expect(firstAssistant.toolCalls?.[0].result).toBe(
      "index.ts\nutils.ts\nconfig.ts",
    );

    // JSONL: user, assistant(+tool_use), tool_result, user, assistant(+tool_use), tool_result
    const types = parsed.map((p: { type: string }) => p.type);
    expect(types).toEqual([
      "user",
      "assistant",
      "user",
      "user",
      "assistant",
      "user",
    ]);

    // Verify parentUuid chaining
    expect(parsed[0].parentUuid).toBeNull();
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i].parentUuid).toBe(parsed[i - 1].uuid);
    }

    // Verify all entries have required fields
    for (const e of parsed) {
      expect(e.sessionId).toBe("sess-abc");
      expect(e.cwd).toBe("/home/user/repo");
      expect(e.isSidechain).toBe(false);
      expect(e.uuid).toBeDefined();
      expect(e.timestamp).toBeDefined();
    }

    // Verify first user message content
    expect(parsed[0].message.content).toBe("List the files in src/");

    // Verify assistant block contains tool_use
    const assistantMsg = parsed[1].message.content;
    const toolUseBlock = assistantMsg.find(
      (b: { type: string }) => b.type === "tool_use",
    );
    expect(toolUseBlock).toEqual({
      type: "tool_use",
      id: "toolu_01ABC",
      name: "Bash",
      input: { command: "ls src/" },
    });

    // Verify Bash tool_result entry
    expect(parsed[2].message.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_01ABC",
      content: "index.ts\nutils.ts\nconfig.ts",
    });

    // Verify second user message
    expect(parsed[3].message.content).toBe("Read index.ts");

    // Verify Read tool_result entry
    expect(parsed[5].message.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_02DEF",
      content: 'export const main = () => console.log("hello");',
    });
  });

  it("handles a session with only user messages and no agent response", () => {
    const s3Logs: StoredEntry[] = [
      s3Entry("user_message", {
        content: { type: "text", text: "hello" },
      }),
    ];

    const turns = rebuildConversation(s3Logs);
    const lines = conversationTurnsToJsonlEntries(turns, config);

    expect(turns).toHaveLength(1);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe("user");
    expect(parsed.message.content).toBe("hello");
  });

  it("handles interleaved non-session/update entries gracefully", () => {
    const s3Logs: StoredEntry[] = [
      s3Entry("user_message", {
        content: { type: "text", text: "hi" },
      }),
      {
        type: "notification",
        timestamp: "2026-03-03T12:00:01.000Z",
        notification: {
          jsonrpc: "2.0",
          method: "_posthog/phase_start",
          params: { phase: "research" },
        },
      },
      s3Entry("agent_message", {
        content: { type: "text", text: "hello back" },
      }),
    ];

    const turns = rebuildConversation(s3Logs);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe("user");
    expect(turns[1].role).toBe("assistant");

    const lines = conversationTurnsToJsonlEntries(turns, config);
    expect(lines).toHaveLength(2);
  });

  it("handles multiple tool calls in a single assistant turn", () => {
    const s3Logs: StoredEntry[] = [
      s3Entry("user_message", {
        content: { type: "text", text: "check both files" },
      }),
      s3Entry("agent_message", {
        content: { type: "text", text: "Reading both." },
      }),
      s3Entry("tool_call", {
        _meta: {
          claudeCode: {
            toolCallId: "tc-a",
            toolName: "Read",
            toolInput: { file_path: "/a.ts" },
          },
        },
      }),
      s3Entry("tool_call", {
        _meta: {
          claudeCode: {
            toolCallId: "tc-b",
            toolName: "Read",
            toolInput: { file_path: "/b.ts" },
          },
        },
      }),
      s3Entry("tool_result", {
        _meta: { claudeCode: { toolCallId: "tc-a", toolResponse: "aaa" } },
      }),
      s3Entry("tool_result", {
        _meta: { claudeCode: { toolCallId: "tc-b", toolResponse: "bbb" } },
      }),
    ];

    const turns = rebuildConversation(s3Logs);
    expect(turns).toHaveLength(2);

    const assistant = turns[1];
    expect(assistant.toolCalls).toHaveLength(2);
    expect(assistant.toolCalls?.[0]).toMatchObject({
      toolCallId: "tc-a",
      result: "aaa",
    });
    expect(assistant.toolCalls?.[1]).toMatchObject({
      toolCallId: "tc-b",
      result: "bbb",
    });

    const lines = conversationTurnsToJsonlEntries(turns, config);
    const parsed = lines.map((l) => JSON.parse(l));

    // user, assistant (with 2 tool_use), tool_result_a, tool_result_b
    expect(parsed).toHaveLength(4);
    expect(parsed[0].type).toBe("user");
    expect(parsed[1].type).toBe("assistant");
    expect(parsed[2].type).toBe("user");
    expect(parsed[3].type).toBe("user");

    const assistantContent = parsed[1].message.content;
    const toolUses = assistantContent.filter(
      (b: { type: string }) => b.type === "tool_use",
    );
    expect(toolUses).toHaveLength(2);
  });
});
