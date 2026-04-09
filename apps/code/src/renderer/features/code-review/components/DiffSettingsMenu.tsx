import { DotsThree } from "@phosphor-icons/react";
import { DropdownMenu, IconButton, Text } from "@radix-ui/themes";
import { useDiffViewerStore } from "@renderer/features/code-editor/stores/diffViewerStore";

export function DiffSettingsMenu() {
  const wordWrap = useDiffViewerStore((s) => s.wordWrap);
  const toggleWordWrap = useDiffViewerStore((s) => s.toggleWordWrap);
  const wordDiffs = useDiffViewerStore((s) => s.wordDiffs);
  const toggleWordDiffs = useDiffViewerStore((s) => s.toggleWordDiffs);
  const hideWhitespaceChanges = useDiffViewerStore(
    (s) => s.hideWhitespaceChanges,
  );
  const toggleHideWhitespaceChanges = useDiffViewerStore(
    (s) => s.toggleHideWhitespaceChanges,
  );
  const showReviewComments = useDiffViewerStore((s) => s.showReviewComments);
  const toggleShowReviewComments = useDiffViewerStore(
    (s) => s.toggleShowReviewComments,
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          style={{ cursor: "pointer" }}
        >
          <DotsThree size={16} weight="bold" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="1" align="end">
        <DropdownMenu.Item onSelect={toggleWordWrap}>
          <Text size="1">
            {wordWrap ? "Disable word wrap" : "Enable word wrap"}
          </Text>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={toggleWordDiffs}>
          <Text size="1">
            {wordDiffs ? "Disable word diffs" : "Enable word diffs"}
          </Text>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={toggleHideWhitespaceChanges}>
          <Text size="1">
            {hideWhitespaceChanges ? "Show whitespace" : "Hide whitespace"}
          </Text>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={toggleShowReviewComments}>
          <Text size="1">
            {showReviewComments
              ? "Hide review comments"
              : "Show review comments"}
          </Text>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
