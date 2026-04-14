import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform } from "react-native";
import { usePreferencesStore } from "@/features/preferences/stores/preferencesStore";
import { useThemeColors } from "@/lib/theme";

export default function TabsLayout() {
  const themeColors = useThemeColors();
  const aiChatEnabled = usePreferencesStore((s) => s.aiChatEnabled);

  // Dynamic colors for liquid glass effect on iOS
  const dynamicTextColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: themeColors.gray[12],
          light: themeColors.gray[12],
        })
      : themeColors.gray[12];

  const dynamicTintColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: themeColors.accent[9],
          light: themeColors.accent[9],
        })
      : themeColors.accent[9];

  return (
    <NativeTabs
      labelStyle={{
        color: dynamicTextColor,
      }}
      tintColor={dynamicTintColor}
      minimizeBehavior="onScrollDown"
    >
      {/* Conversations - Chats tab, hidden by default to focus on Code */}
      {aiChatEnabled && (
        <NativeTabs.Trigger name="index">
          <Label>Chats</Label>
          <Icon
            sf={{
              default: "bubble.left.and.bubble.right",
              selected: "bubble.left.and.bubble.right.fill",
            }}
            drawable="ic_menu_send"
          />
        </NativeTabs.Trigger>
      )}

      {/* Code tab (task list for PostHog Code) */}
      <NativeTabs.Trigger name="tasks">
        <Label>Code</Label>
        <Icon
          sf={{ default: "checklist", selected: "checklist" }}
          drawable="ic_menu_agenda"
        />
      </NativeTabs.Trigger>

      {/* Settings Tab */}
      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        <Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          drawable="ic_menu_preferences"
        />
      </NativeTabs.Trigger>

      {/* TODO: Fix this and use NativeTabs.Trigger for opening the chat */}
      {/* Chat - Separate floating button (iOS search role style) */}
      {/* <NativeTabs.Trigger name="chat" role="search">
        <Label hidden />
        <Icon
          sf={{ default: "plus", selected: "plus" }}
          drawable="ic_menu_add"
        />
      </NativeTabs.Trigger> */}
    </NativeTabs>
  );
}
