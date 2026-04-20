import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import { trpcClient } from "@renderer/trpc/client";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useEffect, useRef } from "react";

interface UseCodeMirrorOptions {
  doc: string;
  extensions: Extension[];
  filePath?: string;
}

export function useCodeMirror(options: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    instanceRef.current?.destroy();
    instanceRef.current = null;

    instanceRef.current = new EditorView({
      state: EditorState.create({
        doc: options.doc,
        extensions: options.extensions,
      }),
      parent: containerRef.current,
    });

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [options]);

  useEffect(() => {
    if (!instanceRef.current || !options.filePath) return;

    const filePath = options.filePath;
    const domElement = instanceRef.current.dom;

    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      const result = await trpcClient.contextMenu.showFileContextMenu.mutate({
        filePath,
      });

      if (!result.action) return;

      if (result.action.type === "external-app") {
        const fileName = filePath.split("/").pop() || "file";

        const allWorkspaces = await workspaceApi.getAll();
        const workspace =
          Object.values(allWorkspaces)
            .flat()
            .find(
              (ws) =>
                (ws?.worktreePath && filePath.startsWith(ws.worktreePath)) ||
                (ws?.folderPath && filePath.startsWith(ws.folderPath)),
            ) ?? null;

        await handleExternalAppAction(
          result.action.action,
          filePath,
          fileName,
          {
            workspace,
            mainRepoPath: workspace?.folderPath,
          },
        );
      }
    };

    domElement.addEventListener("contextmenu", handleContextMenu);

    return () => {
      domElement.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [options.filePath]);

  return { containerRef, instanceRef };
}
