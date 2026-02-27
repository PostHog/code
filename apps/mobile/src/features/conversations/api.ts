import { fetch } from "expo/fetch";
import { getBaseUrl, getHeaders, getProjectId } from "@/lib/api";
import type { ConversationDetail } from "./types";

export async function getConversations(): Promise<ConversationDetail[]> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/conversations/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results ?? [];
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/conversations/${conversationId}/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation: ${response.statusText}`);
  }

  return await response.json();
}
