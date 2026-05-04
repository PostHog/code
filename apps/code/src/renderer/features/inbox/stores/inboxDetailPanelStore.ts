import { createSidebarStore } from "@stores/createSidebarStore";

export const useInboxDetailPanelStore = createSidebarStore({
  name: "inbox-detail-panel-storage",
  defaultWidth: 540,
  defaultOpen: false,
});
