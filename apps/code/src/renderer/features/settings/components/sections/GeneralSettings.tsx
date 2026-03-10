import { useAuthStore } from "@features/auth/stores/authStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import {
  type AutoConvertLongText,
  type CompletionSound,
  type DiffOpenMode,
  type SendMessagesWith,
  useSettingsStore,
} from "@features/settings/stores/settingsStore";
import {
  Button,
  Flex,
  Link,
  Select,
  Slider,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useSettingsStore as useTerminalSettingsStore } from "@stores/settingsStore";
import type { ThemePreference } from "@stores/themeStore";
import { useThemeStore } from "@stores/themeStore";
import { track } from "@utils/analytics";
import { playCompletionSound } from "@utils/sounds";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const CUSTOM_TERMINAL_FONT_VALUE = "custom";
const CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS = 400;
const TERMINAL_FONT_PRESETS = [
  {
    label: "System monospace",
    value: "monospace",
  },
  {
    label: "MesloLGL Nerd Font Mono",
    value: '"MesloLGL Nerd Font Mono", monospace',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", monospace',
  },
];

export function GeneralSettings() {
  // Appearance state
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const terminalFontFamily = useTerminalSettingsStore(
    (state) => state.terminalFontFamily,
  );
  const terminalFontFamilyLoaded = useTerminalSettingsStore(
    (state) => state.terminalFontFamilyLoaded,
  );
  const loadTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.loadTerminalFontFamily,
  );
  const setTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.setTerminalFontFamily,
  );

  // Power state
  const { preventSleepWhileRunning, setPreventSleepWhileRunning } =
    useSettingsStore();
  const { data: serverPreventSleep } = trpcReact.sleep.getEnabled.useQuery();
  const preventSleepMutation = trpcReact.sleep.setEnabled.useMutation();

  useEffect(() => {
    if (serverPreventSleep !== undefined) {
      setPreventSleepWhileRunning(serverPreventSleep);
    }
  }, [serverPreventSleep, setPreventSleepWhileRunning]);

  const handlePreventSleepChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "prevent_sleep_while_running",
        new_value: checked,
        old_value: !checked,
      });
      setPreventSleepWhileRunning(checked);
      preventSleepMutation.mutate({ enabled: checked });
    },
    [setPreventSleepWhileRunning, preventSleepMutation],
  );

  // Chat state
  const {
    desktopNotifications,
    dockBadgeNotifications,
    dockBounceNotifications,
    completionSound,
    completionVolume,
    autoConvertLongText,
    diffOpenMode,
    sendMessagesWith,
    hedgehogMode,
    setDesktopNotifications,
    setDockBadgeNotifications,
    setDockBounceNotifications,
    setCompletionSound,
    setCompletionVolume,
    setAutoConvertLongText,
    setDiffOpenMode,
    setSendMessagesWith,
    setHedgehogMode,
  } = useSettingsStore();

  // Sync toggle off if the user denied notification permission at the OS level
  useEffect(() => {
    if (window.Notification?.permission === "denied" && desktopNotifications) {
      setDesktopNotifications(false);
    }
  }, [desktopNotifications, setDesktopNotifications]);

  const notificationPermission = window.Notification?.permission;
  const notificationsDenied = notificationPermission === "denied";

  const handleDesktopNotificationsChange = useCallback(
    async (checked: boolean) => {
      if (checked) {
        const permission = await window.Notification?.requestPermission?.();
        if (permission !== "granted") {
          toast.info("Notifications are blocked", {
            description:
              "Allow PostHog Code notifications in System Settings > Notifications",
          });
          return;
        }
      }
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "desktop_notifications",
        new_value: checked,
        old_value: desktopNotifications,
      });
      setDesktopNotifications(checked);
    },
    [desktopNotifications, setDesktopNotifications],
  );

  const [customTerminalFont, setCustomTerminalFont] = useState<string>("");
  const customFontSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!terminalFontFamilyLoaded) {
      loadTerminalFontFamily();
    }
  }, [terminalFontFamilyLoaded, loadTerminalFontFamily]);

  useEffect(() => {
    return () => {
      if (customFontSaveTimeoutRef.current) {
        clearTimeout(customFontSaveTimeoutRef.current);
        customFontSaveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const matchesPreset = TERMINAL_FONT_PRESETS.some(
      (preset) => preset.value === terminalFontFamily,
    );
    if (!matchesPreset) {
      setCustomTerminalFont(terminalFontFamily);
    }
  }, [terminalFontFamily]);

  // Appearance handlers
  const handleThemeChange = useCallback(
    (value: ThemePreference) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "theme",
        new_value: value,
        old_value: theme,
      });
      setTheme(value);
    },
    [theme, setTheme],
  );

  const clearCustomFontSaveTimeout = useCallback(() => {
    if (customFontSaveTimeoutRef.current) {
      clearTimeout(customFontSaveTimeoutRef.current);
      customFontSaveTimeoutRef.current = null;
    }
  }, []);

  const commitCustomTerminalFont = useCallback(
    (value: string) => {
      const normalizedValue = value.trim();
      if (!normalizedValue) {
        return;
      }

      const previousValue = terminalFontFamily.trim() || "monospace";
      if (normalizedValue === previousValue) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: normalizedValue,
        old_value: previousValue,
      });

      setTerminalFontFamily(normalizedValue);
    },
    [setTerminalFontFamily, terminalFontFamily],
  );

  const handleTerminalFontChange = useCallback(
    (value: string) => {
      clearCustomFontSaveTimeout();

      if (value === CUSTOM_TERMINAL_FONT_VALUE) {
        if (!customTerminalFont.trim()) {
          setTerminalFontFamily("");
          return;
        }

        commitCustomTerminalFont(customTerminalFont);
        return;
      }

      if (value === terminalFontFamily) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: value,
        old_value: terminalFontFamily,
      });

      setTerminalFontFamily(value);
    },
    [
      clearCustomFontSaveTimeout,
      commitCustomTerminalFont,
      customTerminalFont,
      setTerminalFontFamily,
      terminalFontFamily,
    ],
  );

  const handleCustomTerminalFontChange = useCallback(
    (value: string) => {
      setCustomTerminalFont(value);
      clearCustomFontSaveTimeout();
      customFontSaveTimeoutRef.current = setTimeout(() => {
        commitCustomTerminalFont(value);
      }, CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS);
    },
    [clearCustomFontSaveTimeout, commitCustomTerminalFont],
  );

  const handleCustomTerminalFontBlur = useCallback(() => {
    clearCustomFontSaveTimeout();
    commitCustomTerminalFont(customTerminalFont);
  }, [
    clearCustomFontSaveTimeout,
    commitCustomTerminalFont,
    customTerminalFont,
  ]);

  // Chat handlers
  const handleCompletionSoundChange = useCallback(
    (value: CompletionSound) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "completion_sound",
        new_value: value,
        old_value: completionSound,
      });
      setCompletionSound(value);
    },
    [completionSound, setCompletionSound],
  );

  const handleTestSound = useCallback(() => {
    playCompletionSound(completionSound, completionVolume);
  }, [completionSound, completionVolume]);

  const handleAutoConvertLongTextChange = useCallback(
    (value: AutoConvertLongText) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "auto_convert_long_text",
        new_value: value,
        old_value: autoConvertLongText,
      });
      setAutoConvertLongText(value);
    },
    [autoConvertLongText, setAutoConvertLongText],
  );

  const handleDiffOpenModeChange = useCallback(
    (value: DiffOpenMode) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "diff_open_mode",
        new_value: value,
        old_value: diffOpenMode,
      });
      setDiffOpenMode(value);
    },
    [diffOpenMode, setDiffOpenMode],
  );

  const handleSendMessagesWithChange = useCallback(
    (value: SendMessagesWith) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "send_messages_with",
        new_value: value,
        old_value: sendMessagesWith,
      });
      setSendMessagesWith(value);
    },
    [sendMessagesWith, setSendMessagesWith],
  );

  const handleHedgehogModeChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "hedgehog_mode",
        new_value: checked,
        old_value: hedgehogMode,
      });
      setHedgehogMode(checked);
    },
    [hedgehogMode, setHedgehogMode],
  );

  const terminalFontSelection = TERMINAL_FONT_PRESETS.some(
    (preset) => preset.value === terminalFontFamily,
  )
    ? terminalFontFamily
    : CUSTOM_TERMINAL_FONT_VALUE;

  return (
    <Flex direction="column">
      {/* Appearance */}
      <Text size="2" weight="medium" className="mt-1 mb-2">
        Appearance
      </Text>

      <SettingRow
        label="Theme"
        description="Choose light, dark, or follow your system preference"
      >
        <Select.Root
          value={theme}
          onValueChange={(v) => handleThemeChange(v as ThemePreference)}
          size="1"
        >
          <Select.Trigger style={{ minWidth: "100px" }} />
          <Select.Content>
            <Select.Item value="light">Light</Select.Item>
            <Select.Item value="dark">Dark</Select.Item>
            <Select.Item value="system">System</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      <SettingRow
        label="Terminal font"
        description="Uses locally installed fonts. Nerd fonts are recommended for prompt glyphs"
        noBorder={terminalFontSelection !== CUSTOM_TERMINAL_FONT_VALUE}
      >
        <Select.Root
          value={terminalFontSelection}
          onValueChange={handleTerminalFontChange}
          size="1"
        >
          <Select.Trigger style={{ minWidth: "140px" }} />
          <Select.Content>
            {TERMINAL_FONT_PRESETS.map((preset) => (
              <Select.Item key={preset.value} value={preset.value}>
                {preset.label}
              </Select.Item>
            ))}
            <Select.Item value={CUSTOM_TERMINAL_FONT_VALUE}>
              Custom font family
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      {terminalFontSelection === CUSTOM_TERMINAL_FONT_VALUE && (
        <SettingRow label="Custom font family" noBorder>
          <Flex direction="column" gap="1" style={{ minWidth: "200px" }}>
            <TextField.Root
              size="1"
              placeholder="Enter font family"
              value={customTerminalFont}
              onChange={(event) =>
                handleCustomTerminalFontChange(event.target.value)
              }
              onBlur={handleCustomTerminalFontBlur}
            />
            <Text size="1" color="gray">
              Example: MesloLGL Nerd Font Mono
            </Text>
          </Flex>
        </SettingRow>
      )}

      {/* Notifications */}
      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Notifications
      </Text>

      {notificationsDenied && (
        <Text size="1" color="yellow" className="mb-2">
          Notifications are blocked by macOS. To enable them, open System
          Settings &gt; Notifications &gt; PostHog Code and turn on Allow
          Notifications.
        </Text>
      )}

      <SettingRow
        label="Push notifications"
        description="Receive a desktop notification when the agent finishes a task or needs your input"
      >
        <Switch
          checked={desktopNotifications}
          onCheckedChange={handleDesktopNotificationsChange}
          disabled={notificationsDenied}
          size="1"
        />
      </SettingRow>

      <SettingRow
        label="Dock badge"
        description="Display a badge on the dock icon when the agent finishes a task or needs your input"
      >
        <Switch
          checked={dockBadgeNotifications}
          onCheckedChange={setDockBadgeNotifications}
          size="1"
        />
      </SettingRow>

      <SettingRow
        label="Bounce dock icon"
        description="Bounce the dock icon when the agent finishes a task or needs your input"
      >
        <Switch
          checked={dockBounceNotifications}
          onCheckedChange={setDockBounceNotifications}
          size="1"
        />
      </SettingRow>

      <SettingRow
        label="Sound effect"
        description="Play a sound when the agent finishes a task or needs your input"
        noBorder={completionSound === "none"}
      >
        <Flex align="center" gap="2">
          <Select.Root
            value={completionSound}
            onValueChange={(value) =>
              handleCompletionSoundChange(value as CompletionSound)
            }
            size="1"
          >
            <Select.Trigger style={{ minWidth: "100px" }} />
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              <Select.Item value="guitar">Guitar solo</Select.Item>
              <Select.Item value="danilo">I'm ready</Select.Item>
              <Select.Item value="revi">Cute noise</Select.Item>
              <Select.Item value="meep">Meep</Select.Item>
            </Select.Content>
          </Select.Root>
          {completionSound !== "none" && (
            <Button variant="soft" size="1" onClick={handleTestSound}>
              Test
            </Button>
          )}
        </Flex>
      </SettingRow>

      {completionSound !== "none" && (
        <SettingRow label="Sound volume" noBorder>
          <Flex align="center" gap="3">
            <Slider
              value={[completionVolume]}
              onValueChange={([value]) => setCompletionVolume(value)}
              min={0}
              max={100}
              step={1}
              size="1"
              style={{ width: "120px" }}
            />
            <Text size="1" color="gray">
              {completionVolume}%
            </Text>
          </Flex>
        </SettingRow>
      )}

      {/* Input */}
      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Input
      </Text>

      <SettingRow
        label="Send messages with"
        description="Choose which key combination sends messages. Use Shift+Enter for new lines"
      >
        <Select.Root
          value={sendMessagesWith}
          onValueChange={(value) =>
            handleSendMessagesWithChange(value as SendMessagesWith)
          }
          size="1"
        >
          <Select.Trigger style={{ minWidth: "100px" }} />
          <Select.Content>
            <Select.Item value="enter">Enter</Select.Item>
            <Select.Item value="cmd+enter">⌘ Enter</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      <SettingRow
        label="Auto-convert long text"
        description="Automatically convert pasted text over this length into an attachment"
      >
        <Select.Root
          value={autoConvertLongText}
          onValueChange={(value) =>
            handleAutoConvertLongTextChange(value as AutoConvertLongText)
          }
          size="1"
        >
          <Select.Trigger style={{ minWidth: "120px" }} />
          <Select.Content>
            <Select.Item value="off">Off</Select.Item>
            <Select.Item value="500">500 chars</Select.Item>
            <Select.Item value="1000">1,000 chars</Select.Item>
            <Select.Item value="2500">2,500 chars</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      {/* Editor */}
      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Editor
      </Text>

      <SettingRow
        label="Open diffs in"
        description="Choose how file diffs open when clicking a changed file"
        noBorder
      >
        <Select.Root
          value={diffOpenMode}
          onValueChange={(value) =>
            handleDiffOpenModeChange(value as DiffOpenMode)
          }
          size="1"
        >
          <Select.Trigger style={{ minWidth: "140px" }} />
          <Select.Content>
            <Select.Item value="auto">Auto</Select.Item>
            <Select.Item value="split">Split pane</Select.Item>
            <Select.Item value="same-pane">Same pane</Select.Item>
            <Select.Item value="last-active-pane">Last active pane</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      {/* Power */}
      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Power
      </Text>

      <SettingRow
        label="Keep awake while agents work"
        description="Prevent your computer from sleeping while the agent is running a task"
        noBorder
      >
        <Switch
          checked={preventSleepWhileRunning}
          onCheckedChange={handlePreventSleepChange}
          size="1"
        />
      </SettingRow>

      {/* Fun */}
      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Fun
      </Text>

      <SettingRow
        label="Hedgehog mode"
        description={<HedgehogDescription />}
        noBorder
      >
        <Switch
          checked={hedgehogMode}
          onCheckedChange={handleHedgehogModeChange}
          size="1"
        />
      </SettingRow>
    </Flex>
  );
}

function HedgehogDescription() {
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const projectId = useAuthStore((s) => s.projectId);

  const customizeUrl =
    cloudRegion && projectId
      ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/settings/user-customization`
      : null;

  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        Release a hedgehog buddy to walk around your screen. It might take a few
        seconds to appear.
      </Text>
      {customizeUrl && (
        <Text size="1" color="gray">
          <Link href={customizeUrl} target="_blank">
            Customize your hedgehog
          </Link>
        </Text>
      )}
    </Flex>
  );
}
