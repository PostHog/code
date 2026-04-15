import { Text } from "@components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer } from "@/features/chat";
import {
  getTask,
  type Task,
  TaskSessionView,
  useTaskSessionStore,
} from "@/features/tasks";
import { useThemeColors } from "@/lib/theme";

export default function TaskDetailScreen() {
  const { id: taskId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectToTask, disconnectFromTask, sendPrompt, getSessionForTask } =
    useTaskSessionStore();

  const session = taskId ? getSessionForTask(taskId) : undefined;

  const { height } = useReanimatedKeyboardAnimation();

  // useReanimatedKeyboardAnimation returns negative height values
  // e.g., -300 when keyboard is open, 0 when closed
  const contentPosition = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: height.value }],
    };
  }, []);

  const inputContainerStyle = useAnimatedStyle(() => {
    return {
      marginBottom: height.value < 0 ? 26 : Math.max(insets.bottom, 50),
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTask(taskId)
      .then((fetchedTask) => {
        if (cancelled) return;
        setTask(fetchedTask);
        return connectToTask(fetchedTask);
      })
      .then(() => {
        if (cancelled) return;
        // Brief delay for FlatList to render its initial batch behind
        // the loading overlay before revealing.
        setTimeout(() => setLoading(false), 150);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load task:", err);
        setError("Failed to load task");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      disconnectFromTask(taskId);
    };
  }, [taskId, connectToTask, disconnectFromTask]);

  const handleSendPrompt = useCallback(
    (text: string) => {
      if (!taskId) return;
      sendPrompt(taskId, text).catch((err) => {
        console.error("Failed to send prompt:", err);
      });
    },
    [taskId, sendPrompt],
  );

  const handleOpenTask = useCallback(
    (newTaskId: string) => {
      router.replace(`/task/${newTaskId}`);
    },
    [router],
  );

  if (error || (!task && !loading)) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: false,
            headerTitle: "Error",
            headerStyle: { backgroundColor: themeColors.background },
            headerTintColor: themeColors.gray[12],
            presentation: "modal",
          }}
        />
        <View className="flex-1 items-center justify-center bg-background px-4">
          <Text className="mb-4 text-center text-status-error">
            {error || "Task not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-gray-3 px-4 py-2"
          >
            <Text className="text-gray-12">Go back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const environment = task?.latest_run?.environment;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerTitle: loading ? "Loading..." : task?.title || "Task",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
          headerTitleStyle: {
            fontWeight: "600",
          },
          presentation: "modal",
          headerRight: environment
            ? () => (
                <Pressable
                  className={`rounded-full px-3 py-1 ${
                    environment === "cloud" ? "bg-accent-3" : "bg-gray-4"
                  }`}
                >
                  <Text
                    className={`font-medium text-xs ${
                      environment === "cloud"
                        ? "text-accent-11"
                        : "text-gray-11"
                    }`}
                  >
                    {environment === "cloud" ? "Cloud" : "Local"}
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Animated.View className="flex-1 bg-background" style={contentPosition}>
        {/* Always render TaskSessionView so the FlatList can layout behind
            the loading overlay. This prevents the "flash of messages" when
            switching from loading spinner to rendered content. */}
        <TaskSessionView
          events={session?.events ?? []}
          isConnecting={session?.isPromptPending ?? false}
          isThinking={session?.isPromptPending ?? false}
          onOpenTask={handleOpenTask}
          onSendAnswer={handleSendPrompt}
          contentContainerStyle={{
            paddingTop: 80 + insets.bottom,
            paddingBottom: 16,
          }}
        />

        {/* Loading overlay — covers the list while it does initial layout */}
        {loading && (
          <View className="absolute inset-0 items-center justify-center bg-background">
            <ActivityIndicator size="large" color={themeColors.accent[9]} />
            <Text className="mt-4 text-gray-11">Loading task...</Text>
          </View>
        )}

        {/* Fixed input at bottom */}
        <Animated.View
          className="absolute inset-x-0 bottom-0"
          style={inputContainerStyle}
        >
          <Composer
            onSend={handleSendPrompt}
            isUserTurn={!(session?.isPromptPending ?? true)}
            queuedCount={session?.messageQueue?.length ?? 0}
          />
        </Animated.View>
      </Animated.View>
    </>
  );
}
