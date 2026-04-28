import { router } from "expo-router";
import {
  Linking,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthStore, useUserQuery } from "@/features/auth";
import { usePreferencesStore } from "@/features/preferences/stores/preferencesStore";

export default function SettingsScreen() {
  const { logout, cloudRegion, getCloudUrlFromRegion } = useAuthStore();
  const { data: userData } = useUserQuery();
  const aiChatEnabled = usePreferencesStore((s) => s.aiChatEnabled);
  const setAiChatEnabled = usePreferencesStore((s) => s.setAiChatEnabled);
  const pingsEnabled = usePreferencesStore((s) => s.pingsEnabled);
  const setPingsEnabled = usePreferencesStore((s) => s.setPingsEnabled);

  const handleLogout = async () => {
    await logout();
    router.replace("/auth");
  };

  const handleOpenSettings = () => {
    if (!cloudRegion) return;
    const baseUrl = getCloudUrlFromRegion(cloudRegion);
    Linking.openURL(`${baseUrl}/settings`);
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-12 pb-12">
        {/* Header */}
        <View className="mb-8">
          <Text className="font-bold text-3xl text-gray-12">Settings</Text>
        </View>

        {/* Organization */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Organization
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Region</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {cloudRegion?.toUpperCase() || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Display name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.organization?.name || "—"}
            </Text>
          </View>
        </View>

        {/* Project */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Project
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Display name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.team?.name || "—"}
            </Text>
          </View>
        </View>

        {/* Profile */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-4 font-semibold text-gray-12 text-lg">
            Profile
          </Text>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">First name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.first_name || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Last name</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.last_name || "—"}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-gray-11 text-sm">Email</Text>
            <Text className="font-medium text-gray-12 text-sm">
              {userData?.email || "—"}
            </Text>
          </View>
        </View>

        {/* Labs */}
        <View className="mb-6 rounded-xl bg-gray-2 p-4">
          <Text className="mb-1 font-semibold text-gray-12 text-lg">Labs</Text>
          <Text className="mb-4 text-gray-11 text-xs">
            Experimental features
          </Text>
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-4">
              <Text className="font-medium text-gray-12 text-sm">
                PostHog AI chat
              </Text>
              <Text className="text-gray-11 text-xs">
                Show the Chats tab for PostHog AI conversations
              </Text>
            </View>
            <Switch value={aiChatEnabled} onValueChange={setAiChatEnabled} />
          </View>
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-4">
              <Text className="font-medium text-gray-12 text-sm">
                Enable pings
              </Text>
              <Text className="text-gray-11 text-xs">
                Play a sound when a task completes
              </Text>
            </View>
            <Switch value={pingsEnabled} onValueChange={setPingsEnabled} />
          </View>
        </View>

        {/* All Settings Button */}
        <TouchableOpacity
          className="mb-6 items-center rounded-lg border border-gray-6 bg-gray-3 py-4"
          onPress={handleOpenSettings}
        >
          <Text className="font-semibold text-base text-gray-12">
            All settings
          </Text>
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity
          className="items-center rounded-lg border border-status-error bg-status-error/10 py-4"
          onPress={handleLogout}
        >
          <Text className="font-semibold text-base text-status-error">
            Sign out
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
