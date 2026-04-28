import { DEFAULT_PANEL_IDS } from "@features/panels/constants/panelConstants";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useTRPC } from "@renderer/trpc/client";
import { useSubscription } from "@trpc/tanstack-react-query";

/**
 * Mounted at the top of the authenticated app shell. Subscribes once to
 * `preview.onReady` and translates each event into a panel tab via
 * `usePanelLayoutStore.addPreviewTab`. Renders nothing.
 */
export function PreviewSubscriber() {
  const trpcReact = useTRPC();

  useSubscription(
    trpcReact.preview.onReady.subscriptionOptions(undefined, {
      onData: (data) => {
        usePanelLayoutStore
          .getState()
          .addPreviewTab(data.taskId, DEFAULT_PANEL_IDS.MAIN_PANEL, {
            name: data.name,
            url: data.url,
            taskId: data.taskId,
          });
      },
    }),
  );

  return null;
}
