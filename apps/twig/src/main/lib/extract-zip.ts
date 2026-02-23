import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";

/**
 * Extracts a ZIP file to a directory using fflate (cross-platform, no native dependencies).
 */
export async function extractZip(
  zipPath: string,
  extractDir: string,
): Promise<void> {
  const data = await readFile(zipPath);
  const unzipped = unzipSync(new Uint8Array(data));
  for (const [filename, content] of Object.entries(unzipped)) {
    const fullPath = join(extractDir, filename);
    if (filename.endsWith("/")) {
      await mkdir(fullPath, { recursive: true });
    } else {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }
  }
}
