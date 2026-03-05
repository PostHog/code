import type { ContentBlock } from "@agentclientprotocol/sdk";

function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath);
}

function pathToFileUri(filePath: string): string {
  const encoded = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `file://${encoded}`;
}

export async function buildPromptBlocks(
  textContent: string,
  filePaths: string[],
  repoPath: string,
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  blocks.push({ type: "text", text: textContent });

  for (const filePath of filePaths) {
    const absolutePath = isAbsolutePath(filePath)
      ? filePath
      : `${repoPath}/${filePath}`;
    const uri = pathToFileUri(absolutePath);
    const name = filePath.split("/").pop() ?? filePath;
    blocks.push({
      type: "resource_link",
      uri,
      name,
    });
  }

  return blocks;
}
