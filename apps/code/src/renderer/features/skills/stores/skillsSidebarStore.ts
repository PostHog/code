import { createSidebarStore } from "@stores/createSidebarStore";

export const useSkillsSidebarStore = createSidebarStore({
  name: "skills-sidebar",
  defaultWidth: 380,
});
