/**
 * In-process MCP server exposing memory tools to the agent.
 *
 * Uses the Claude Agent SDK's createSdkMcpServer for zero-overhead
 * in-process tool registration — no child process or HTTP server needed.
 *
 * Tools:
 *   - save_memory:    Explicitly persist a memory the agent considers important
 *   - recall_memory:  Search for relevant memories mid-task
 *   - forget_memory:  Mark a memory as outdated or incorrect
 *   - list_memories:  Browse stored memories with filtering
 */

import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Logger } from "../utils/logger";
import type { AgentMemoryManager } from "./agent-memory";
import { DEFAULT_IMPORTANCE, MemoryType } from "./types";

const MEMORY_TYPE_VALUES = Object.values(MemoryType) as [string, ...string[]];

// ── Handler arg types (explicit because SDK generics lose inference) ─────

interface SaveMemoryArgs {
  content: string;
  memory_type: string;
  importance?: number;
}

interface RecallMemoryArgs {
  query: string;
  memory_types?: string[];
  limit?: number;
}

interface ForgetMemoryArgs {
  memory_id: string;
  reason?: string;
}

interface ListMemoriesArgs {
  memory_types?: string[];
  min_importance?: number;
  limit?: number;
  include_forgotten?: boolean;
}

/**
 * Create an in-process MCP server with memory tools.
 * The returned config can be added directly to Options.mcpServers.
 */
export function createMemoryMcpServer(
  memoryService: AgentMemoryManager,
): McpSdkServerConfigWithInstance {
  const logger = new Logger({ debug: true, prefix: "[MemoryMCP]" });

  // biome-ignore lint/suspicious/noExplicitAny: SDK's SdkMcpToolDefinition<any> requires this
  const tools: SdkMcpToolDefinition<any>[] = [
    {
      name: "save_memory",
      description: `Explicitly save a memory for future task runs. Use this when you discover something important about the codebase, user preferences, architectural decisions, or gotchas that would help in future work.

Memory types:
- identity: Core facts about the project, team, or codebase
- goal: High-level goals and objectives
- decision: Architectural, process, or tooling decisions
- todo: Action items discovered but not yet completed
- preference: User preferences for how work should be done
- fact: Concrete facts about APIs, infrastructure, services
- event: Notable events (deployments, incidents, migrations)
- observation: Patterns, conventions, or behaviors noticed

Default importance by type: identity=1.0, goal=0.9, decision=0.8, todo=0.8, preference=0.7, fact=0.6, event=0.4, observation=0.3`,
      inputSchema: {
        content: z
          .string()
          .describe("The memory content — concise, actionable, 1-2 sentences"),
        memory_type: z.enum(MEMORY_TYPE_VALUES).describe("The type of memory"),
        importance: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Importance score 0-1 (defaults to type default)"),
      },
      annotations: {
        title: "Save Memory",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (rawArgs: unknown) => {
        const args = rawArgs as SaveMemoryArgs;
        const memoryType = args.memory_type as MemoryType;
        logger.info("Tool call: save_memory", {
          type: memoryType,
          importance: args.importance,
          contentPreview: args.content.slice(0, 80),
        });
        const memory = memoryService.save(args.content, memoryType, {
          importance: args.importance ?? DEFAULT_IMPORTANCE[memoryType],
          source: "agent_explicit",
        });
        logger.info("Tool result: save_memory", {
          id: memory.id,
          type: memory.memoryType,
          importance: memory.importance,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Memory saved (id: ${memory.id}, type: ${memory.memoryType}, importance: ${memory.importance})`,
            },
          ],
        };
      },
    },
    {
      name: "recall_memory",
      description: `Search for relevant memories from past task runs. Use this when you need context that might have been learned before — e.g., how an API works, what conventions exist, what pitfalls to avoid, or what the user prefers.

The search uses full-text search with Porter stemming, scored by relevance + importance + recency + access frequency.`,
      inputSchema: {
        query: z.string().describe("Natural language search query"),
        memory_types: z
          .array(z.enum(MEMORY_TYPE_VALUES))
          .optional()
          .describe("Filter by memory types (optional)"),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results (default: 10)"),
      },
      annotations: {
        title: "Recall Memory",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (rawArgs: unknown) => {
        const args = rawArgs as RecallMemoryArgs;
        logger.info("Tool call: recall_memory", {
          query: args.query.slice(0, 80),
          types: args.memory_types,
          limit: args.limit,
        });
        const memories = memoryService.search({
          query: args.query,
          memoryTypes: args.memory_types as MemoryType[] | undefined,
          limit: args.limit ?? 10,
        });
        logger.info("Tool result: recall_memory", {
          found: memories.length,
          topScores: memories.slice(0, 3).map((m) => m.score.toFixed(3)),
        });

        if (memories.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No relevant memories found.",
              },
            ],
          };
        }

        const lines = memories.map(
          (m, i) =>
            `${i + 1}. [${m.memoryType.toUpperCase()}] (importance: ${m.importance.toFixed(1)}, score: ${m.score.toFixed(2)}) ${m.content}\n   id: ${m.id}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${memories.length} memories:\n\n${lines.join("\n\n")}`,
            },
          ],
        };
      },
    },
    {
      name: "forget_memory",
      description:
        "Mark a memory as forgotten/outdated. Use this when you discover that a previously stored memory is incorrect, outdated, or no longer relevant. The memory is soft-deleted (can be recovered).",
      inputSchema: {
        memory_id: z.string().describe("The ID of the memory to forget"),
        reason: z
          .string()
          .optional()
          .describe("Why this memory is being forgotten"),
      },
      annotations: {
        title: "Forget Memory",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (rawArgs: unknown) => {
        const args = rawArgs as ForgetMemoryArgs;
        logger.info("Tool call: forget_memory", {
          memoryId: args.memory_id,
          reason: args.reason,
        });
        const svc = memoryService.getService();
        const memory = svc.load(args.memory_id);

        if (!memory) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Memory not found: ${args.memory_id}`,
              },
            ],
            isError: true,
          };
        }

        svc.forget(args.memory_id);
        logger.info("Tool result: forget_memory", {
          id: args.memory_id,
          content: memory.content.slice(0, 60),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Memory forgotten: "${memory.content.slice(0, 80)}..."${args.reason ? ` (reason: ${args.reason})` : ""}`,
            },
          ],
        };
      },
    },
    {
      name: "list_memories",
      description:
        "List stored memories with optional filtering by type and importance. Useful for browsing what the agent knows or for debugging the memory system.",
      inputSchema: {
        memory_types: z
          .array(z.enum(MEMORY_TYPE_VALUES))
          .optional()
          .describe("Filter by memory types"),
        min_importance: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum importance threshold (default: 0)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default: 20)"),
        include_forgotten: z
          .boolean()
          .optional()
          .describe("Include forgotten memories (default: false)"),
      },
      annotations: {
        title: "List Memories",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (rawArgs: unknown) => {
        const args = rawArgs as ListMemoriesArgs;
        logger.info("Tool call: list_memories", {
          types: args.memory_types,
          minImportance: args.min_importance,
          limit: args.limit,
          includeForgotten: args.include_forgotten,
        });
        const memories = memoryService.search({
          memoryTypes: args.memory_types as MemoryType[] | undefined,
          minImportance: args.min_importance ?? 0,
          limit: args.limit ?? 20,
          includeForgotten: args.include_forgotten ?? false,
        });

        const stats = memoryService.stats();
        logger.info("Tool result: list_memories", {
          found: memories.length,
          stats,
        });

        if (memories.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No memories found. Total memories: ${stats.total}.`,
              },
            ],
          };
        }

        const lines = memories.map(
          (m) =>
            `- [${m.memoryType.toUpperCase()}] (importance: ${m.importance.toFixed(1)}${m.forgotten ? ", FORGOTTEN" : ""}) ${m.content}\n  id: ${m.id} | accessed: ${m.accessCount}x | last: ${m.lastAccessedAt}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Memory store: ${stats.total} total\n\n${lines.join("\n\n")}`,
            },
          ],
        };
      },
    },
  ];

  return createSdkMcpServer({
    name: "memory",
    version: "1.0.0",
    tools,
  });
}
