import { Text } from "@components/text";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { InteractionManager, Pressable, View } from "react-native";
import { TaskList } from "@/features/tasks";

export default function TasksScreen() {
  const router = useRouter();
  const readyRef = useRef(true);

  // Block navigation while a modal dismiss animation is in progress.
  // When the screen loses focus (modal opens), readyRef is false.
  // When focus returns (modal dismissed), we wait for all native
  // animations to finish before allowing the next push.
  useFocusEffect(
    useCallback(() => {
      const handle = InteractionManager.runAfterInteractions(() => {
        readyRef.current = true;
      });
      return () => {
        readyRef.current = false;
        handle.cancel();
      };
    }, []),
  );

  const handleCreateTask = useCallback(() => {
    if (!readyRef.current) return;
    readyRef.current = false;
    router.push("/task");
  }, [router]);

  const handleTaskPress = useCallback(
    (taskId: string) => {
      if (!readyRef.current) return;
      readyRef.current = false;
      router.push(`/task/${taskId}`);
    },
    [router],
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-gray-6 border-b px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-2xl text-gray-12">Code</Text>
            <Text className="text-gray-11 text-sm">
              Your PostHog Code sessions
            </Text>
          </View>
          <Pressable
            onPress={handleCreateTask}
            className="rounded-lg bg-accent-9 px-4 py-2"
          >
            <Text className="font-semibold text-accent-contrast text-sm">
              New task
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Task List */}
      <TaskList onTaskPress={handleTaskPress} onCreateTask={handleCreateTask} />
    </View>
  );
}
