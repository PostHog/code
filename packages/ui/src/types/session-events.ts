export interface JsonRpcNotification<T = unknown> {
  jsonrpc?: "2.0";
  method: string;
  params?: T;
}

export interface JsonRpcRequest<T = unknown> {
  jsonrpc?: "2.0";
  id: number;
  method: string;
  params?: T;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc?: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcNotification
  | JsonRpcRequest
  | JsonRpcResponse;

export function isJsonRpcNotification(
  msg: JsonRpcMessage,
): msg is JsonRpcNotification {
  return "method" in msg && !("id" in msg);
}

export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "method" in msg && "id" in msg;
}

export function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return !("method" in msg) && "id" in msg;
}

export interface AcpMessage {
  type: "acp_message";
  ts: number;
  message: JsonRpcMessage;
}

export interface StoredLogEntry {
  type: string;
  timestamp?: string;
  notification?: {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };
}

export type TaskRunStatus =
  | "started"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";
