import { Tooltip } from "@components/ui/Tooltip";
import { useSettingsStore as useFeatureSettingsStore } from "@features/settings/stores/settingsStore";
import { GithubLogo } from "@phosphor-icons/react";
import { trpcClient } from "@renderer/trpc/client";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MentionChipAttrs } from "./MentionChipNode";

const chipClass =
  "inline cursor-default select-all rounded-[var(--radius-1)] bg-[var(--accent-a3)] px-1 py-px font-medium text-[var(--accent-11)] text-xs";

function DefaultChip({
  type,
  id,
  label,
}: {
  type: string;
  id: string;
  label: string;
}) {
  if (type === "github_issue") {
    return (
      <button
        type="button"
        className={`${chipClass} inline-flex cursor-pointer items-center gap-0.5 border-none`}
        contentEditable={false}
        onClick={() => window.open(id, "_blank")}
      >
        <GithubLogo size={12} />
        {label}
      </button>
    );
  }

  const isCommand = type === "command";
  const prefix = isCommand ? "/" : "@";
  const isFile = type === "file";

  const chip = (
    <span
      className={`${isCommand ? "cli-slash-command" : "cli-file-mention"} ${chipClass}`}
      contentEditable={false}
    >
      {prefix}
      {label}
    </span>
  );

  if (isFile) {
    return <Tooltip content={id}>{chip}</Tooltip>;
  }

  return chip;
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
        <DefaultChip type={type} id={id} label={label} />
      )}
    </NodeViewWrapper>
  );
}
