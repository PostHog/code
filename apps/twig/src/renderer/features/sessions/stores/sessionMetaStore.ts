import { electronStorage } from "@renderer/lib/electronStorage";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const log = logger.scope("session-meta-store");

type AdapterType = "claude" | "codex";

interface SessionMeta {
  adapter?: AdapterType;
  sdkSessionId?: string;
}

interface SessionMetaState {
  metaByRunId: Record<string, SessionMeta>;
  setAdapter: (taskRunId: string, adapter: AdapterType) => void;
  getAdapter: (taskRunId: string) => AdapterType | undefined;
  setSdkSessionId: (taskRunId: string, sdkSessionId: string) => void;
  getSdkSessionId: (taskRunId: string) => string | undefined;
  removeSdkSessionId: (taskRunId: string) => void;
  removeAll: (taskRunId: string) => void;
}

export const useSessionMetaStore = create<SessionMetaState>()(
  persist(
    (set, get) => ({
      metaByRunId: {},
      setAdapter: (taskRunId, adapter) =>
        set((state) => ({
          metaByRunId: {
            ...state.metaByRunId,
            [taskRunId]: { ...state.metaByRunId[taskRunId], adapter },
          },
        })),
      getAdapter: (taskRunId) => get().metaByRunId[taskRunId]?.adapter,
      setSdkSessionId: (taskRunId, sdkSessionId) =>
        set((state) => ({
          metaByRunId: {
            ...state.metaByRunId,
            [taskRunId]: { ...state.metaByRunId[taskRunId], sdkSessionId },
          },
        })),
      getSdkSessionId: (taskRunId) =>
        get().metaByRunId[taskRunId]?.sdkSessionId,
      removeSdkSessionId: (taskRunId) =>
        set((state) => {
          const existing = state.metaByRunId[taskRunId];
          if (!existing) return state;
          const { sdkSessionId: _removed, ...rest } = existing;
          if (Object.keys(rest).length === 0) {
            const { [taskRunId]: _entry, ...remaining } = state.metaByRunId;
            return { metaByRunId: remaining };
          }
          return {
            metaByRunId: { ...state.metaByRunId, [taskRunId]: rest },
          };
        }),
      removeAll: (taskRunId) =>
        set((state) => {
          const { [taskRunId]: _removed, ...rest } = state.metaByRunId;
          return { metaByRunId: rest };
        }),
    }),
    {
      name: "session-meta-storage",
      storage: electronStorage,
      partialize: (state) => ({ metaByRunId: state.metaByRunId }),
      onRehydrateStorage: () => () => {
        migrateOldAdapterStorage();
      },
    },
  ),
);

const OLD_ADAPTER_STORAGE_KEY = "session-adapter-storage";

async function migrateOldAdapterStorage(): Promise<void> {
  try {
    const raw = await trpcVanilla.secureStore.getItem.query({
      key: OLD_ADAPTER_STORAGE_KEY,
    });
    if (!raw) return;

    const parsed = JSON.parse(raw) as {
      state?: { adaptersByRunId?: Record<string, AdapterType> };
    };
    const adapters = parsed?.state?.adaptersByRunId;
    if (!adapters || Object.keys(adapters).length === 0) {
      await trpcVanilla.secureStore.removeItem.query({
        key: OLD_ADAPTER_STORAGE_KEY,
      });
      return;
    }

    const store = useSessionMetaStore.getState();
    for (const [taskRunId, adapter] of Object.entries(adapters)) {
      if (!store.getAdapter(taskRunId)) {
        store.setAdapter(taskRunId, adapter);
      }
    }

    await trpcVanilla.secureStore.removeItem.query({
      key: OLD_ADAPTER_STORAGE_KEY,
    });
    log.info("Migrated old session-adapter-storage", {
      count: Object.keys(adapters).length,
    });
  } catch {
    log.warn("Failed to migrate old session-adapter-storage");
  }
}
