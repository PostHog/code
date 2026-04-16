import * as Haptics from "expo-haptics";
import { Archive, ArrowCounterClockwise } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Text,
  View,
} from "react-native";
import { useThemeColors } from "@/lib/theme";
import type { Task } from "../types";
import { TaskItem } from "./TaskItem";

const SWIPE_THRESHOLD = 60;

interface SwipeableTaskItemProps {
  task: Task;
  isArchived: boolean;
  onPress: (task: Task) => void;
  onArchive: (taskId: string) => void;
  onUnarchive: (taskId: string) => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export function SwipeableTaskItem({
  task,
  isArchived,
  onPress,
  onArchive,
  onUnarchive,
  onSwipeStart,
  onSwipeEnd,
}: SwipeableTaskItemProps) {
  const themeColors = useThemeColors();
  const translateX = useRef(new Animated.Value(0)).current;
  const actionTriggeredRef = useRef(false);

  // Reset position when the item reappears (e.g. moved between sections)
  useEffect(() => {
    translateX.setValue(0);
    actionTriggeredRef.current = false;
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      // Start tracking immediately on horizontal movement
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 5 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
        gesture.dx < 0,
      // Capture before children so FlatList doesn't steal
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy * 1.2) &&
        gesture.dx < 0,
      // Never let go once we have the gesture
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        actionTriggeredRef.current = false;
        onSwipeStart?.();
      },
      onPanResponderMove: Animated.event([null, { dx: translateX }], {
        useNativeDriver: false,
        listener: (_: unknown, gesture: { dx: number }) => {
          // Clamp to left-only
          if (gesture.dx > 0) translateX.setValue(0);
        },
      }),
      onPanResponderRelease: (_, gesture) => {
        onSwipeEnd?.();
        if (gesture.dx < -SWIPE_THRESHOLD && !actionTriggeredRef.current) {
          actionTriggeredRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(translateX, {
            toValue: -400,
            duration: 150,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }).start(() => {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            if (isArchived) {
              onUnarchive(task.id);
            } else {
              onArchive(task.id);
            }
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        onSwipeEnd?.();
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const actionBg = isArchived ? themeColors.accent[9] : themeColors.gray[8];
  const ActionIcon = isArchived ? ArrowCounterClockwise : Archive;
  const actionLabel = isArchived ? "Restore" : "Archive";

  return (
    <View className="overflow-hidden">
      {/* Action revealed behind the row */}
      <View
        className="absolute inset-y-0 right-0 left-0 flex-row items-center justify-end px-5"
        style={{ backgroundColor: actionBg }}
      >
        <ActionIcon size={18} color="#fff" />
        <Text className="ml-2 font-medium text-white text-xs">
          {actionLabel}
        </Text>
      </View>

      {/* Sliding task row */}
      <Animated.View
        style={{
          transform: [{ translateX }],
          backgroundColor: themeColors.background,
        }}
        {...panResponder.panHandlers}
      >
        <TaskItem task={task} onPress={onPress} />
      </Animated.View>
    </View>
  );
}
