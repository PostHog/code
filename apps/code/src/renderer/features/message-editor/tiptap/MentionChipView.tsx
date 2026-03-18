import { Tooltip } from "@components/ui/Tooltip";
import { useSettingsStore as useFeatureSettingsStore } from "@features/settings/stores/settingsStore";
import { trpcClient } from "@renderer/trpc/client";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MentionChipAttrs } from "./MentionChipNode";

function DefaultChip({ type, label }: { type: string; label: string }) {
  const isCommand = type === "command";
  const prefix = isCommand ? "/" : "@";

  return (
    <span
      className={`${isCommand ? "cli-slash-command" : "cli-file-mention"} inline cursor-default select-all rounded-[var(--radius-1)] bg-[var(--accent-a3)] px-1 py-px font-medium text-[var(--accent-11)] text-xs`}
      contentEditable={false}
    >
      {prefix}
      {label}
    </span>
  );
}

function PastedTextChip({
  label,
  filePath,
  editor,
  node,
  getPos,
}: {
  label: string;
  filePath: string;
  editor: Editor;
  node: PmNode;
  getPos: () => number | undefined;
}) {
  const handleClick = async () => {
    useFeatureSettingsStore.getState().markHintLearned("paste-as-file");

    const content = await trpcClient.fs.readAbsoluteFile.query({
      filePath,
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
  };

  return (
    <Tooltip content="Click to paste as text instead">
      <button
        type="button"
        className="cli-file-mention inline cursor-pointer select-all rounded-[var(--radius-1)] border-none bg-[var(--accent-a3)] px-1 py-px font-medium text-[var(--accent-11)] text-xs hover:bg-[var(--accent-a4)]"
        contentEditable={false}
        onClick={handleClick}
      >
        @{label}
      </button>
    </Tooltip>
  );
}

export function MentionChipView({ node, getPos, editor }: NodeViewProps) {
  const { type, id, label, pastedText } = node.attrs as MentionChipAttrs;

  return (
    <NodeViewWrapper as="span" className="inline">
      {pastedText ? (
        <PastedTextChip
          label={label}
          filePath={id}
          editor={editor}
          node={node}
          getPos={getPos}
        />
      ) : (
        <DefaultChip type={type} label={label} />
      )}
    </NodeViewWrapper>
  );
}
