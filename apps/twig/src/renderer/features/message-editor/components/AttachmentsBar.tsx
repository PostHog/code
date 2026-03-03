import { File, X } from "@phosphor-icons/react";
import { Dialog, Flex, IconButton, Text } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import { useEffect, useRef } from "react";
import type { FileAttachment } from "../utils/content";
import { isGifFile, isImageFile } from "../utils/imageUtils";

function FrozenGifThumbnail({ src, alt }: { src: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      className="size-3.5 rounded-sm object-cover"
    />
  );
}

function ImageThumbnail({
  attachment,
  onRemove,
}: {
  attachment: FileAttachment;
  onRemove: () => void;
}) {
  const { data: dataUrl } = trpcReact.os.readFileAsDataUrl.useQuery(
    { filePath: attachment.id },
    { staleTime: Infinity },
  );

  const isGif = isGifFile(attachment.label);

  return (
    <Dialog.Root>
      <div className="group relative flex-shrink-0">
        <Dialog.Trigger>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--radius-1)] bg-[var(--gray-a3)] p-1 font-medium text-[10px] text-[var(--gray-11)] leading-tight hover:bg-[var(--gray-a4)]"
          >
            {dataUrl ? (
              isGif ? (
                <FrozenGifThumbnail src={dataUrl} alt={attachment.label} />
              ) : (
                <img
                  src={dataUrl}
                  alt={attachment.label}
                  className="size-3.5 rounded-sm object-cover"
                />
              )
            ) : (
              <span className="size-3.5 rounded-sm bg-[var(--gray-a5)]" />
            )}
            <span className="max-w-[80px] truncate">{attachment.label}</span>
          </button>
        </Dialog.Trigger>
        <IconButton
          size="1"
          variant="solid"
          color="gray"
          className="!absolute -top-1 -right-1 !size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={8} weight="bold" />
        </IconButton>
      </div>
      <Dialog.Content maxWidth="90vw" style={{ padding: 16 }}>
        <Dialog.Title size="2" mb="2">
          {attachment.label}
        </Dialog.Title>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={attachment.label}
            style={{
              maxWidth: "85vw",
              maxHeight: "75vh",
              objectFit: "contain",
            }}
          />
        ) : (
          <Text size="2" color="gray">
            Unable to load image preview
          </Text>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function FileChip({
  attachment,
  onRemove,
}: {
  attachment: FileAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="inline-flex items-center gap-1 rounded-[var(--radius-1)] bg-[var(--gray-a3)] p-1 font-medium text-[10px] text-[var(--gray-11)] leading-tight">
        <File size={14} weight="duotone" className="shrink-0" />
        <span className="max-w-[120px] truncate">{attachment.label}</span>
      </span>
      <IconButton
        size="1"
        variant="solid"
        color="gray"
        className="!absolute -top-1 -right-1 !size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X size={8} weight="bold" />
      </IconButton>
    </div>
  );
}

interface AttachmentsBarProps {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentsBar({ attachments, onRemove }: AttachmentsBarProps) {
  if (attachments.length === 0) return null;

  return (
    <Flex gap="1" align="center" className="mb-2 flex-wrap">
      {attachments.map((att) =>
        isImageFile(att.label) ? (
          <ImageThumbnail
            key={att.id}
            attachment={att}
            onRemove={() => onRemove(att.id)}
          />
        ) : (
          <FileChip
            key={att.id}
            attachment={att}
            onRemove={() => onRemove(att.id)}
          />
        ),
      )}
    </Flex>
  );
}
