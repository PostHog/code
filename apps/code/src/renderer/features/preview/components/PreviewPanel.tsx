import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import { ExternalLink, Link as LinkIcon, RotateCw } from "lucide-react";
import { useCallback, useRef } from "react";

interface PreviewPanelProps {
  url: string;
  previewName: string;
}

interface WebviewElement extends HTMLElement {
  reload: () => void;
  src: string;
}

export function PreviewPanel({ url, previewName }: PreviewPanelProps) {
  const webviewRef = useRef<WebviewElement | null>(null);

  const handleReload = useCallback(() => {
    const node = webviewRef.current;
    if (node && typeof node.reload === "function") {
      node.reload();
    }
  }, []);

  const handleCopyUrl = useCallback(() => {
    void navigator.clipboard.writeText(url);
  }, [url]);

  const handleOpenExternal = useCallback(() => {
    void trpcClient.os.openExternal.mutate({ url });
  }, [url]);

  return (
    <Flex direction="column" className="size-full bg-(--gray-2)">
      <Flex
        align="center"
        gap="2"
        className="border-(--gray-5) border-b px-3 py-1.5"
      >
        <Tooltip content="Reload">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleReload}
            aria-label="Reload preview"
          >
            <RotateCw size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip content="Copy URL">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleCopyUrl}
            aria-label="Copy preview URL"
          >
            <LinkIcon size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip content="Open in external browser">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleOpenExternal}
            aria-label="Open preview in external browser"
          >
            <ExternalLink size={14} />
          </IconButton>
        </Tooltip>
        <Text size="1" color="gray" className="ml-1 truncate">
          {previewName} – {url}
        </Text>
      </Flex>
      <div className="min-h-0 flex-1">
        <webview
          ref={webviewRef as unknown as React.Ref<HTMLElement>}
          src={url}
          partition="preview"
          className="size-full"
        />
      </div>
    </Flex>
  );
}
