import type { AgentMode } from "../types.js";
import type { RemoteMcpServer } from "./schemas.js";

export interface AgentServerConfig {
  port: number;
  repositoryPath?: string;
  apiUrl: string;
  apiKey: string;
  projectId: number;
  jwtPublicKey: string; // RS256 public key for JWT verification
  mode: AgentMode;
  taskId: string;
  runId: string;
  version?: string;
  mcpServers?: RemoteMcpServer[];
  baseBranch?: string;
}
