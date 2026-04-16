import { trpcClient } from "@renderer/trpc/client";
import { logger } from "@utils/logger";
import { create } from "zustand";

const log = logger.scope("update-store");

type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  isEnabled: boolean;

  installUpdate: () => Promise<void>;
  checkForUpdates: () => void;
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: "idle",
  version: null,
  isEnabled: false,

  installUpdate: async () => {
    if (get().status === "installing") return;

    set({ status: "installing" });

    try {
      const result = await trpcClient.updates.install.mutate();
      if (!result.installed) {
        log.error("Update install returned not installed");
        set({ status: "ready" });
      }
    } catch (error) {
      log.error("Failed to install update", { error });
      set({ status: "ready" });
    }
  },

  checkForUpdates: () => {
    trpcClient.updates.check.mutate().catch((error: unknown) => {
      log.error("Failed to check for updates", { error });
    });
  },
}));

export function initializeUpdateStore() {
  trpcClient.updates.isEnabled
    .query()
    .then((result) => {
      useUpdateStore.setState({ isEnabled: result.enabled });
    })
    .catch((error: unknown) => {
      log.error("Failed to get update enabled status", { error });
    });

  const statusSub = trpcClient.updates.onStatus.subscribe(undefined, {
    onData: (status) => {
      if (status.checking && status.downloading) {
        useUpdateStore.setState({ status: "downloading" });
      } else if (status.checking) {
        useUpdateStore.setState({ status: "checking" });
      } else if (status.upToDate) {
        const current = useUpdateStore.getState().status;
        if (current === "checking" || current === "downloading") {
          useUpdateStore.setState({ status: "idle" });
        }
      } else if (status.error) {
        log.error("Update check failed", { error: status.error });
        const current = useUpdateStore.getState().status;
        if (current === "checking" || current === "downloading") {
          useUpdateStore.setState({ status: "idle" });
        }
      }
    },
    onError: (error) => {
      log.error("Update status subscription error", { error });
    },
  });

  const readySub = trpcClient.updates.onReady.subscribe(undefined, {
    onData: (data) => {
      useUpdateStore.setState({
        status: "ready",
        version: data.version,
      });
    },
    onError: (error) => {
      log.error("Update ready subscription error", { error });
    },
  });

  const menuCheckSub = trpcClient.updates.onCheckFromMenu.subscribe(undefined, {
    onData: () => {
      useUpdateStore.getState().checkForUpdates();
    },
    onError: (error) => {
      log.error("Update menu check subscription error", { error });
    },
  });

  return () => {
    statusSub.unsubscribe();
    readySub.unsubscribe();
    menuCheckSub.unsubscribe();
  };
}
