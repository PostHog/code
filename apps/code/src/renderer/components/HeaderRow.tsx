import { DiffStatsBadge } from "@features/code-review/components/DiffStatsBadge";
import { CloudGitInteractionHeader } from "@features/git-interaction/components/CloudGitInteractionHeader";
import { GitInteractionHeader } from "@features/git-interaction/components/GitInteractionHeader";
import { SidebarTrigger } from "@features/sidebar/components/SidebarTrigger";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { Box, Flex } from "@radix-ui/themes";
import { useHeaderStore } from "@stores/headerStore";
import { useNavigationStore } from "@stores/navigationStore";
import { isWindows } from "@utils/platform";

export const HEADER_HEIGHT = 36;
const COLLAPSED_WIDTH = 110;
/** Width reserved for Windows title bar buttons (Close/Minimize/Maximize) */
const WINDOWS_TITLEBAR_INSET = 140;

export function HeaderRow() {
  const content = useHeaderStore((state) => state.content);
  const view = useNavigationStore((state) => state.view);

  const sidebarOpen = useSidebarStore((state) => state.open);
  const sidebarWidth = useSidebarStore((state) => state.width);
  const isResizing = useSidebarStore((state) => state.isResizing);
  const setIsResizing = useSidebarStore((state) => state.setIsResizing);

  const activeTaskId = view.type === "task-detail" ? view.data?.id : undefined;
  const activeWorkspace = useWorkspace(activeTaskId);
  const isCloudTask = activeWorkspace?.mode === "cloud";

  const handleLeftSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <Flex
      align="center"
      className="drag"
      style={{
        height: `${HEADER_HEIGHT}px`,
        minHeight: `${HEADER_HEIGHT}px`,
        borderBottom: "1px solid var(--gray-6)",
        paddingRight: isWindows ? `${WINDOWS_TITLEBAR_INSET}px` : undefined,
      }}
    >
      <Flex
        align="center"
        justify="end"
        px="2"
        pr="3"
        style={{
          width: sidebarOpen ? `${sidebarWidth}px` : `${COLLAPSED_WIDTH}px`,
          minWidth: `${COLLAPSED_WIDTH}px`,
          height: "100%",
          borderRight: "1px solid var(--gray-6)",
          transition: isResizing ? "none" : "width 0.2s ease-in-out",
          position: "relative",
        }}
      >
        <SidebarTrigger />
        {sidebarOpen && (
          <Box
            onMouseDown={handleLeftSidebarMouseDown}
            className="no-drag"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              cursor: "col-resize",
              backgroundColor: "transparent",
              zIndex: 100,
            }}
          />
        )}
      </Flex>

      {content && (
        <Flex
          align="center"
          justify="between"
          px="3"
          flexGrow="1"
          style={{ height: "100%", overflow: "hidden" }}
        >
          {content}
        </Flex>
      )}

      {view.type === "task-detail" && view.data && (
        <Flex
          align="center"
          gap="3"
          pr="3"
          style={{
            height: "100%",
            flexShrink: 0,
          }}
        >
          <div className="no-drag">
            {isCloudTask ? (
              <CloudGitInteractionHeader taskId={view.data.id} />
            ) : (
              <GitInteractionHeader taskId={view.data.id} />
            )}
          </div>
          <DiffStatsBadge task={view.data} />
        </Flex>
      )}
    </Flex>
  );
}
