import { getImageMimeType } from "@features/code-editor/utils/imageUtils";
import { trpcClient } from "@renderer/trpc/client";

const CHUNK_SIZE = 8192;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

export interface PersistedFile {
  path: string;
  name: string;
  mimeType?: string;
}

export async function persistImageFile(file: File): Promise<PersistedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(arrayBuffer);
  const mimeType = file.type || getImageMimeType(file.name);

  const result = await trpcClient.os.saveClipboardImage.mutate({
    base64Data,
    mimeType,
    originalName: file.name,
  });
  return { path: result.path, name: result.name, mimeType: result.mimeType };
}

export async function persistTextContent(
  text: string,
  originalName?: string,
): Promise<PersistedFile> {
  const result = await trpcClient.os.saveClipboardText.mutate({
    text,
    originalName,
  });
  return { path: result.path, name: result.name };
}

export async function persistGenericFile(file: File): Promise<PersistedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(arrayBuffer);

  const result = await trpcClient.os.saveClipboardFile.mutate({
    base64Data,
    originalName: file.name,
  });

  return {
    path: result.path,
    name: result.name,
    mimeType: file.type || undefined,
  };
}

export async function persistBrowserFile(
  file: File,
): Promise<{ id: string; label: string }> {
  if (file.type.startsWith("image/")) {
    const result = await persistImageFile(file);
    return { id: result.path, label: file.name };
  }

  const result = await persistGenericFile(file);
  return { id: result.path, label: result.name };
}
