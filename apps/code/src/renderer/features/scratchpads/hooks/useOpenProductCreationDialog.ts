import { useScratchpadCreationStore } from "@features/scratchpads/stores/scratchpadCreationStore";
import { useCallback } from "react";

export function useOpenProductCreationDialog() {
  const openDialog = useScratchpadCreationStore((s) => s.openDialog);
  return useCallback(() => {
    openDialog();
  }, [openDialog]);
}
