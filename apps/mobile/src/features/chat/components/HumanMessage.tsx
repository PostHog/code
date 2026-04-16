import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { Alert, Pressable, Text, View } from "react-native";

interface HumanMessageProps {
  content: string;
  timestamp?: number;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function HumanMessage({ content, timestamp }: HumanMessageProps) {
  const handleLongPress = useCallback(() => {
    Clipboard.setStringAsync(content).then(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Copied", "Message copied to clipboard.");
    });
  }, [content]);

  return (
    <View className="px-4 py-2">
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <View className="mt-3 max-w-[95%] rounded bg-accent-3 px-3 py-2">
          <Text className="font-mono text-[13px] text-accent-12 leading-5">
            {content}
          </Text>
        </View>
      </Pressable>
      {timestamp && (
        <Text className="mt-1 px-1 font-mono text-[10px] text-gray-8">
          {formatRelativeTime(timestamp)}
        </Text>
      )}
    </View>
  );
}
