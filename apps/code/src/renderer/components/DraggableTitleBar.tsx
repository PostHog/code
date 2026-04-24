import { Box } from "@radix-ui/themes";
import { HEADER_HEIGHT } from "./HeaderRow";

/**
 * A draggable title bar component for Electron windows.
 * Provides a draggable area at the top of the window when using hidden title bars (e.g. login screen).
 */
export function DraggableTitleBar() {
  return (
    <Box
      className="drag absolute top-0 right-0 left-0 z-10 w-full"
      style={{
        height: HEADER_HEIGHT,
      }}
    />
  );
}
