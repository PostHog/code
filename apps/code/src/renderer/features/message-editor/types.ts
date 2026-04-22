import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { GithubIssueState } from "@main/services/git/schemas";
import type {
  EditorContent,
  FileAttachment,
  MentionChip,
} from "./utils/content";

export type { GithubIssueState };

export interface EditorHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => EditorContent;
  getText: () => string;
  setContent: (text: string) => void;
  insertChip: (chip: MentionChip) => void;
  addAttachment: (attachment: FileAttachment) => void;
  removeAttachment: (id: string) => void;
}

export interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
  filename?: string;
}

export interface FileSuggestionItem extends SuggestionItem {
  path: string;
}

export interface CommandSuggestionItem extends SuggestionItem {
  command: AvailableCommand;
}

export interface IssueSuggestionItem extends SuggestionItem {
  number: number;
  title: string;
  url: string;
  repo: string;
  state: GithubIssueState;
  labels: string[];
}

export type SuggestionLoadingState = "idle" | "loading" | "error" | "success";

export interface SuggestionPosition {
  x: number;
  y: number;
}
