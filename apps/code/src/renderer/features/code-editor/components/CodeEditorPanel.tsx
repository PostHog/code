import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { isImageFile } from "@features/message-editor/utils/imageUtils";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box, Flex } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import type { Task } from "@shared/types";

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  tif: "image/tiff",
};

function getImageMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[ext] ?? "image/png";
}

interface CodeEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function CodeEditorPanel({
  taskId,
  task: _task,
  absolutePath,
}: CodeEditorPanelProps) {
  const repoPath = useCwd(taskId);
  const isInsideRepo = !!repoPath && absolutePath.startsWith(repoPath);
  const filePath = getRelativePath(absolutePath, repoPath);
  const isImage = isImageFile(absolutePath);

  const repoQuery = trpcReact.fs.readRepoFile.useQuery(
    { repoPath: repoPath ?? "", filePath },
    { enabled: isInsideRepo && !isImage, staleTime: Infinity },
  );

  const absoluteQuery = trpcReact.fs.readAbsoluteFile.useQuery(
    { filePath: absolutePath },
    { enabled: !isInsideRepo && !isImage, staleTime: Infinity },
  );

  const imageQuery = trpcReact.fs.readFileAsBase64.useQuery(
    { filePath: absolutePath },
    { enabled: isImage, staleTime: Infinity },
  );

  const {
    data: fileContent,
    isLoading,
    error,
  } = isInsideRepo ? repoQuery : absoluteQuery;

  if (isImage) {
    if (imageQuery.isLoading) {
      return <PanelMessage>Loading image...</PanelMessage>;
    }
    if (imageQuery.error || !imageQuery.data) {
      return (
        <PanelMessage detail={absolutePath}>Failed to load image</PanelMessage>
      );
    }
    const mimeType = getImageMimeType(absolutePath);
    return (
      <Flex
        align="center"
        justify="center"
        height="100%"
        p="4"
        style={{ overflow: "auto" }}
      >
        <img
          src={`data:${mimeType};base64,${imageQuery.data}`}
          alt={filePath}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </Flex>
    );
  }

  if (isLoading) {
    return <PanelMessage>Loading file...</PanelMessage>;
  }

  if (error || fileContent == null) {
    return (
      <PanelMessage detail={absolutePath}>Failed to load file</PanelMessage>
    );
  }

  if (fileContent.length === 0) {
    return <PanelMessage>File is empty</PanelMessage>;
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorEditor
        content={fileContent}
        filePath={absolutePath}
        relativePath={filePath}
        readOnly
      />
    </Box>
  );
}
