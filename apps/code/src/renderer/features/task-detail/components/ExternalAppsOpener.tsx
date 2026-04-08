import { useExternalApps } from "@features/external-apps/hooks/useExternalApps";
import { CodeIcon, CopyIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const THUMBNAIL_ICON_SIZE = 20;
const DROPDOWN_ICON_SIZE = 16;

interface ExternalAppsOpenerProps {
  targetPath: string | null;
}

export function ExternalAppsOpener({ targetPath }: ExternalAppsOpenerProps) {
  const { detectedApps, defaultApp, isLoading } = useExternalApps();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleOpenDefault = useCallback(async () => {
    if (!defaultApp || !targetPath) return;
    const displayName = targetPath.split("/").pop() || targetPath;
    await handleExternalAppAction(
      { type: "open-in-app", appId: defaultApp.id },
      targetPath,
      displayName,
    );
  }, [defaultApp, targetPath]);

  const handleOpenWith = useCallback(
    async (appId: string) => {
      if (!targetPath) return;
      const displayName = targetPath.split("/").pop() || targetPath;
      await handleExternalAppAction(
        { type: "open-in-app", appId },
        targetPath,
        displayName,
      );
    },
    [targetPath],
  );

  const handleCopyPath = useCallback(async () => {
    if (!targetPath) return;
    const displayName = targetPath.split("/").pop() || targetPath;
    await handleExternalAppAction(
      { type: "copy-path" },
      targetPath,
      displayName,
    );
  }, [targetPath]);

  useHotkeys(
    SHORTCUTS.OPEN_IN_EDITOR,
    (event) => {
      event.preventDefault();
      handleOpenDefault();
    },
    { enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [handleOpenDefault],
  );

  useHotkeys(
    SHORTCUTS.COPY_PATH,
    (event) => {
      event.preventDefault();
      handleCopyPath();
    },
    { enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [handleCopyPath],
  );

  if (!targetPath) {
    return null;
  }

  const isReady = !isLoading && detectedApps.length > 0;

  return (
    <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <Flex align="center" className="no-drag" gap="0">
        <button
          type="button"
          aria-label={`Open in ${defaultApp?.name ?? "editor"}`}
          onClick={handleOpenDefault}
          disabled={!isReady || !defaultApp}
          className="hover:bg-[var(--gray-a3)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "26px",
            height: "24px",
            borderRadius: "var(--radius-1) 0 0 var(--radius-1)",
            border: "1px solid var(--gray-6)",
            borderRight: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--gray-11)",
          }}
        >
          {defaultApp?.icon ? (
            <img
              src={defaultApp.icon}
              width={DROPDOWN_ICON_SIZE}
              height={DROPDOWN_ICON_SIZE}
              alt=""
              style={{ borderRadius: "2px" }}
            />
          ) : (
            <CodeIcon size={DROPDOWN_ICON_SIZE} weight="regular" />
          )}
        </button>
        <DropdownMenu.Trigger>
          <button
            type="button"
            aria-label="More editor options"
            className="hover:bg-[var(--gray-a3)]"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "24px",
              borderRadius: "0 var(--radius-1) var(--radius-1) 0",
              border: "1px solid var(--gray-6)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--gray-11)",
            }}
          >
            <ChevronDownIcon width={10} height={10} />
          </button>
        </DropdownMenu.Trigger>
      </Flex>

      <DropdownMenu.Content align="end">
        {detectedApps.map((app) => (
          <DropdownMenu.Item
            key={app.id}
            onSelect={() => handleOpenWith(app.id)}
            shortcut={app.id === defaultApp?.id ? "⌘ O" : undefined}
            className="px-1"
          >
            <Flex align="center" gap="2">
              {app.icon ? (
                <img
                  src={app.icon}
                  width={THUMBNAIL_ICON_SIZE}
                  height={THUMBNAIL_ICON_SIZE}
                  alt=""
                />
              ) : (
                <CodeIcon size={THUMBNAIL_ICON_SIZE} weight="regular" />
              )}
              <Text size="1">{app.name}</Text>
            </Flex>
          </DropdownMenu.Item>
        ))}
        <DropdownMenu.Item
          onSelect={handleCopyPath}
          shortcut="⌘ ⇧ C"
          className="px-1"
        >
          <Flex align="center" gap="2">
            <CopyIcon size={THUMBNAIL_ICON_SIZE} weight="regular" />
            <Text size="1">Copy Path</Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
