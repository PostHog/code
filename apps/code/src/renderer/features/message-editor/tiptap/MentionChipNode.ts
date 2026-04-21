import { useSettingsStore as useFeatureSettingsStore } from "@features/settings/stores/settingsStore";
import { buttonVariants, cn } from "@posthog/quill";
import { trpcClient } from "@renderer/trpc/client";
import { mergeAttributes, Node } from "@tiptap/core";

export type ChipType =
  | "file"
  | "command"
  | "error"
  | "experiment"
  | "insight"
  | "feature_flag"
  | "github_issue";

export interface MentionChipAttrs {
  type: ChipType;
  id: string;
  label: string;
  pastedText: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mentionChip: {
      insertMentionChip: (attrs: MentionChipAttrs) => ReturnType;
    };
  }
}

// Compute Quill Chip classes once at module load (size="xs", variant="outline")
const chipClasses = cn(
  buttonVariants({ size: "xs", variant: "outline" }),
  "gap-1 rounded-sm has-data-[slot=chip-close]:pe-0 bg-background max-w-full",
  "relative -top-[2px] cursor-default active:translate-y-0",
);

const closeClasses = cn(
  buttonVariants({ size: "xs", variant: "outline" }),
  "size-5 p-0 opacity-50 hover:opacity-100",
);

const selectedRingClasses = ["border-ring/50", "ring-[3px]", "ring-ring/50"];

// Lucide XIcon SVG (matches Quill ChipClose default)
const xIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

// GitHub logo SVG
const githubIconSvg =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

export const MentionChipNode = Node.create({
  name: "mentionChip",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      type: { default: "file" as ChipType },
      id: { default: "" },
      label: { default: "" },
      pastedText: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-chip="true"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { type, label } = node.attrs as MentionChipAttrs;
    const isCommand = type === "command";
    const prefix = isCommand ? "/" : "@";

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-chip": "true",
        "data-chip-type": type,
        "data-chip-id": node.attrs.id,
        "data-chip-label": label,
        class: `${isCommand ? "cli-slash-command" : "cli-file-mention"} inline select-all cursor-default rounded-[var(--radius-1)] bg-[var(--accent-a3)] px-1 py-px text-xs font-medium text-[var(--accent-11)]`,
        contenteditable: "false",
      }),
      `${prefix}${label}`,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const { type, id, label, pastedText } = node.attrs as MentionChipAttrs;
      const isCommand = type === "command";
      const prefix = isCommand ? "/" : "@";

      // Outer wrapper — keeps inline flow
      const dom = document.createElement("span");
      dom.className = "inline";
      dom.contentEditable = "false";

      // Chip button — matches Quill <Chip size="xs" variant="outline">
      const chip = document.createElement("button");
      chip.type = "button";
      chip.setAttribute("data-slot", "chip");
      chip.contentEditable = "false";
      chip.className = cn(
        chipClasses,
        isCommand ? "cli-slash-command" : "cli-file-mention",
      );

      // GitHub issue icon
      if (type === "github_issue") {
        chip.insertAdjacentHTML("beforeend", githubIconSvg);
      }

      // Label text
      chip.appendChild(
        document.createTextNode(
          type === "github_issue" ? label : `${prefix}${label}`,
        ),
      );

      // Tooltip via title attr
      if (type === "file") {
        chip.title = id;
      } else if (pastedText) {
        chip.title = "Click to paste as text instead";
      }

      // Close button — matches Quill <ChipClose>
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.setAttribute("data-slot", "chip-close");
      closeBtn.className = closeClasses;
      closeBtn.innerHTML = xIconSvg;
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pos = getPos();
        if (pos == null) return;
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + node.nodeSize })
          .run();
      });
      chip.appendChild(closeBtn);

      // Click handlers
      if (type === "github_issue") {
        chip.addEventListener("click", () => window.open(id, "_blank"));
      } else if (pastedText) {
        chip.addEventListener("click", async () => {
          useFeatureSettingsStore.getState().markHintLearned("paste-as-file");
          const content = await trpcClient.fs.readAbsoluteFile.query({
            filePath: id,
          });
          if (!content) return;
          const pos = getPos();
          if (pos == null) return;
          editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .insertContentAt(pos, content)
            .run();
        });
      }

      dom.appendChild(chip);

      return {
        dom,
        selectNode() {
          for (const cls of selectedRingClasses) chip.classList.add(cls);
        },
        deselectNode() {
          for (const cls of selectedRingClasses) chip.classList.remove(cls);
        },
      };
    };
  },

  addCommands() {
    return {
      insertMentionChip:
        (attrs: MentionChipAttrs) =>
        ({ chain }) => {
          return chain()
            .insertContent([
              { type: this.name, attrs },
              { type: "text", text: " " },
            ])
            .run();
        },
    };
  },
});
