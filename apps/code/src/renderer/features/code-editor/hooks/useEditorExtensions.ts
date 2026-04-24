import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useThemeStore } from "@stores/themeStore";
import { useMemo } from "react";
import { postHogEnrichmentExtension } from "../extensions/postHogEnrichment";
import { oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

export function useEditorExtensions(
  filePath?: string,
  readOnly = false,
  enableEnrichment = false,
) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      search(),
      highlightSelectionMatches(),
      keymap.of(searchKeymap),
      EditorView.lineWrapping,
      theme,
      EditorView.editable.of(!readOnly),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(languageExtension ? [languageExtension] : []),
      ...(enableEnrichment ? [postHogEnrichmentExtension()] : []),
    ];
  }, [filePath, isDarkMode, readOnly, enableEnrichment]);
}
