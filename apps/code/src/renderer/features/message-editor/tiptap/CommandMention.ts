import { getCommandSuggestions } from "../suggestions/getSuggestions";
import { createSuggestionMention } from "./createSuggestionMention";

export interface CommandMentionOptions {
  sessionId: string;
}

export function createCommandMention(options: CommandMentionOptions) {
  const { sessionId } = options;

  return createSuggestionMention({
    name: "commandMention",
    char: "/",
    chipType: "command",
    startOfLine: true,
    items: (query) =>
      sessionId ? getCommandSuggestions(sessionId, query) : [],
  });
}
