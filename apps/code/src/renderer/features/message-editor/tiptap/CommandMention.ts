import { getPortalContainer } from "@components/ThemeWrapper";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { getCommandSuggestions } from "../suggestions/getSuggestions";
import type { CommandSuggestionItem, SuggestionItem } from "../types";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";

function createSuggestion(
  sessionId: string,
): Partial<SuggestionOptions<SuggestionItem>> {
  return {
    char: "/",
    allowSpaces: false,
    startOfLine: true,

    items: ({ query }): CommandSuggestionItem[] => {
      if (!sessionId) return [];
      return getCommandSuggestions(sessionId, query);
    },

    render: () => {
      let component: ReactRenderer<SuggestionListRef> | null = null;
      let popup: TippyInstance | null = null;
      let dismissed = false;

      return {
        onStart: (props) => {
          dismissed = false;
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          const container = getPortalContainer();
          popup = tippy(container, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => container,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
            offset: [0, 12],
            duration: 0,
          });
        },

        onUpdate: (props) => {
          component?.updateProps({
            items: props.items,
            command: props.command,
          });

          if (props.clientRect && popup) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            props.event.stopPropagation();
            popup?.hide();
            dismissed = true;
            return true;
          }

          if (dismissed) return false;

          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as CommandSuggestionItem;

      // Insert command as a chip, let user add context and submit when ready
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mentionChip",
            attrs: {
              type: "command",
              id: item.id,
              label: item.label,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  };
}

export interface CommandMentionOptions {
  sessionId: string;
}

export function createCommandMention(options: CommandMentionOptions) {
  const { sessionId } = options;

  return Mention.extend<CommandMentionOptions>({
    name: "commandMention",

    addOptions() {
      return {
        ...this.parent?.(),
        sessionId,
        suggestion: createSuggestion(sessionId),
      };
    },
  });
}
