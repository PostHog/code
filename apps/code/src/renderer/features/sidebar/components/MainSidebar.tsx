import { useWorkspaces } from "@features/workspace/hooks/useWorkspace";
import { Box } from "@radix-ui/themes";
import { useEffect } from "react";
import { useSidebarStore } from "../stores/sidebarStore";
import { Sidebar, SidebarContent } from "./index";

export function MainSidebar() {
  const { data: workspaces = {}, isFetched } = useWorkspaces();
  const setOpenAuto = useSidebarStore((state) => state.setOpenAuto);

  useEffect(() => {
    if (isFetched) {
      const workspaceCount = Object.keys(workspaces).length;
      setOpenAuto(workspaceCount > 0);
    }
  }, [isFetched, workspaces, setOpenAuto]);

  return (
    <Box flexShrink="0" style={{ flexShrink: 0 }}>
      <Sidebar>
        <SidebarContent />
      </Sidebar>
    </Box>
  );
}
