import { getPortalContainer } from "@components/ThemeWrapper";
import Mention, { type MentionOptions } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { ReactNode } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { SuggestionItem } from "../types";
import type { ChipType } from "./MentionChipNode";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";
import { createSuggestionLoader } from "./suggestionLoader";

export interface SuggestionMentionConfig<T extends SuggestionItem> {
  name: string;
  char: string;
  chipType: ChipType;
  startOfLine?: boolean;
  allowSpaces?: boolean;
  debounceMs?: number;
  items: (query: string) => T[] | Promise<T[]>;
  renderItem?: (item: T) => ReactNode;
}

export function createSuggestionMention<T extends SuggestionItem>(
  config: SuggestionMentionConfig<T>,
) {
  const {
    name,
    char,
    chipType,
    startOfLine = false,
    allowSpaces = false,
    debounceMs = 0,
    items: loadItems,
    renderItem,
  } = config;

  const renderItemUntyped = renderItem
    ? (item: SuggestionItem) => renderItem(item as T)
    : undefined;

  const loader = createSuggestionLoader<T>({
    items: loadItems,
    debounceMs,
  });

  let renderer: ReactRenderer<SuggestionListRef> | null = null;
  let currentCommand: ((item: SuggestionItem) => void) | null = null;

  const pushProps = () => {
    if (!renderer || !currentCommand) return;
    const { items, loading } = loader.getState();
    renderer.updateProps({
      items,
      command: currentCommand,
      renderItem: renderItemUntyped,
      loading,
    });
  };

  loader.subscribe(() => pushProps());

  const suggestion: Partial<SuggestionOptions<T>> = {
    char,
    allowSpaces,
    startOfLine,

    items: ({ query }) => loader.load(query),

    render: () => {
      let popup: TippyInstance | null = null;
      let dismissed = false;

      return {
        onStart: (props) => {
          dismissed = false;
          currentCommand = props.command;
          const { items, loading } = loader.getState();
          renderer = new ReactRenderer(SuggestionList, {
            props: {
              items,
              command: props.command,
              renderItem: renderItemUntyped,
              loading,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          const container = getPortalContainer();
          popup = tippy(container, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => container,
            content: renderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
            offset: [0, 12],
            duration: 0,
          });
        },

        onUpdate: (props) => {
          if (props.items.length > 0) dismissed = false;
          currentCommand = props.command;
          pushProps();

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

          return renderer?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.destroy();
          renderer?.destroy();
          renderer = null;
          currentCommand = null;
          loader.reset();
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as SuggestionItem;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mentionChip",
            attrs: {
              type: item.chipType ?? chipType,
              id: item.id,
              label: item.label,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  };

  return Mention.extend({
    name,
    addOptions(): MentionOptions {
      const parent = this.parent?.();
      if (!parent) {
        throw new Error(`${name}: expected Mention parent options`);
      }
      return { ...parent, suggestion };
    },
  });
}
