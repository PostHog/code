# Message Editor

Tiptap-based editor with mention support for files (`@`) and commands (`/`).

## Structure

```
message-editor/
├── components/
│   ├── PromptInput.tsx      # Shared prompt input (editor + Quill InputGroup toolbar)
│   ├── ModeSelector.tsx     # Mode dropdown (plan / acceptEdits / default / etc.)
│   ├── AttachmentMenu.tsx   # File + issue picker
│   └── AttachmentsBar.tsx   # Attached-files strip shown above the editor
├── tiptap/
│   ├── useTiptapEditor.ts   # Hook that creates the editor
│   ├── useDraftSync.ts      # Persists drafts to store
│   ├── extensions.ts        # Configures Tiptap extensions
│   ├── CommandMention.ts    # / command suggestions
│   ├── FileMention.ts       # @ file suggestions
│   ├── MentionChipNode.ts   # Renders chips in editor
│   └── SuggestionList.tsx   # Dropdown UI for suggestions
├── suggestions/
│   └── getSuggestions.ts    # Fetches suggestions via tRPC
├── stores/
│   └── draftStore.ts        # Zustand store for drafts
├── utils/
│   └── content.ts           # EditorContent type + serialization
└── types.ts                 # EditorHandle + suggestion item types
```

## How it works

1. `PromptInput` calls `useTiptapEditor` with session config
2. `useTiptapEditor` creates a Tiptap editor with extensions from `extensions.ts`
3. Extensions include `CommandMention` and `FileMention` which show suggestions on `/` and `@`
4. Suggestions are fetched via `getSuggestions.ts` (commands from session store, files via tRPC)
5. Selected suggestions become `MentionChipNode` elements in the editor
6. `useDraftSync` saves editor content to `draftStore` on every change
7. On submit, content is serialized to XML via `contentToXml()` and sent to the session
