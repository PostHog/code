import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import type { SerializedEnrichment } from "@posthog/enricher";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";

const SUPPORTED_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go)$/i;

interface UseFileEnrichmentOptions {
  taskId: string;
  filePath: string;
  absolutePath?: string;
  content: string | null | undefined;
}

export function useFileEnrichment({
  taskId,
  filePath,
  absolutePath,
  content,
}: UseFileEnrichmentOptions): SerializedEnrichment | null {
  const trpc = useTRPC();
  const isAuthenticated = useAuthStateValue(
    (s) => s.status === "authenticated",
  );

  // Wrapper helpers like `track(...)` don't mention `posthog` literally, so we
  // only require the extension + supported size. The enrichment pipeline on
  // the server bails out if there's no direct usage AND no resolvable wrapper.
  const hasContent =
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= 1_000_000;
  const extSupported = SUPPORTED_EXT.test(filePath);

  const query = useQuery(
    trpc.enrichment.enrichFile.queryOptions(
      { taskId, filePath, absolutePath, content: content ?? "" },
      {
        enabled: hasContent && extSupported && isAuthenticated,
        staleTime: Infinity,
      },
    ),
  );

  return query.data ?? null;
}
