import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { TaskData } from "@features/sidebar/hooks/useSidebarData";
import {
  ChatCircleIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  HandPalmIcon,
  PauseIcon,
  PlusIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import type { Task } from "@shared/types";
import { isMac } from "@utils/platform";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const ICON_SIZE = 16;
const MOD_KEY = isMac ? "Meta" : "Control";
const HOLD_DELAY_MS = 1000;
const ITEM_HEIGHT = 64;
const ITEM_GAP = 4;
const ITEM_STRIDE = ITEM_HEIGHT + ITEM_GAP;
const CONTAINER_HEIGHT = 420;
const ITEM_WIDTH = 260;

const SPACE_HOTKEY_OPTIONS = {
  enableOnFormTags: true,
  enableOnContentEditable: true,
  preventDefault: false,
} as const;

function isInputWithContent(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.length > 0;
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    return (el.textContent?.length ?? 0) > 0;
  }
  return false;
}

const MASK_STYLE = {
  maskImage:
    "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
} as const;

interface SpaceSwitcherProps {
  tasks: TaskData[];
  activeTaskId: string | null;
  allTasks: Task[];
  isOnNewTask: boolean;
  onNavigateToTask: (task: Task) => void;
  onNewTask: () => void;
}

function getStatusIcon(task: TaskData) {
  if (task.needsPermission) {
    return (
      <HandPalmIcon size={ICON_SIZE} weight="fill" className="text-blue-11" />
    );
  }
  if (task.isGenerating) {
    return <DotsCircleSpinner size={ICON_SIZE} className="text-accent-11" />;
  }
  if (task.taskRunStatus === "completed") {
    return (
      <CheckCircleIcon
        size={ICON_SIZE}
        weight="fill"
        className="text-green-11"
      />
    );
  }
  if (task.taskRunStatus === "failed" || task.taskRunStatus === "cancelled") {
    return (
      <XCircleIcon size={ICON_SIZE} weight="fill" className="text-red-11" />
    );
  }
  if (task.taskRunStatus === "in_progress" || task.taskRunStatus === "queued") {
    return (
      <CircleNotchIcon
        size={ICON_SIZE}
        className="animate-spin text-accent-11"
      />
    );
  }
  if (task.isSuspended) {
    return <PauseIcon size={ICON_SIZE} className="text-gray-9" />;
  }
  return <ChatCircleIcon size={ICON_SIZE} className="text-gray-10" />;
}

function getStatusText(task: TaskData): string | null {
  if (task.needsPermission) return "Needs permission";
  if (task.isGenerating) return "Working...";
  if (task.taskRunStatus === "completed") return "Completed";
  if (task.taskRunStatus === "failed") return "Failed";
  if (task.taskRunStatus === "cancelled") return "Cancelled";
  if (task.taskRunStatus === "in_progress") return "In progress";
  if (task.taskRunStatus === "queued") return "Queued";
  if (task.isSuspended) return "Suspended";
  return null;
}

const SpaceItem = memo(function SpaceItem({
  task,
  isActive,
  index,
  onClick,
}: {
  task: TaskData;
  isActive: boolean;
  index: number;
  onClick: () => void;
}) {
  const statusText = getStatusText(task);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border px-3 transition-colors duration-150 ${
        isActive
          ? "border-accent-9 bg-accent-3"
          : "border-transparent bg-gray-3 hover:bg-gray-4"
      }`}
      style={{
        height: ITEM_HEIGHT,
        width: ITEM_WIDTH,
        boxShadow: isActive
          ? "0 0 16px color-mix(in srgb, var(--accent-9), transparent 70%)"
          : undefined,
      }}
    >
      {/* Status icon */}
      <span className="flex shrink-0 items-center justify-center">
        {getStatusIcon(task)}
      </span>

      {/* Text content */}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span
          className={`w-full truncate text-left text-[13px] ${
            isActive ? "font-medium text-gray-12" : "text-gray-11"
          }`}
        >
          {task.title}
        </span>
        {statusText && (
          <span
            className={`text-[11px] ${
              isActive ? "text-accent-11" : "text-gray-9"
            }`}
          >
            {statusText}
          </span>
        )}
      </span>

      {/* Position number */}
      <span className="shrink-0 text-[11px] text-gray-9 tabular-nums">
        {index + 1}
      </span>
    </button>
  );
});

const NewTaskItem = memo(function NewTaskItem({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border px-3 transition-colors duration-150 ${
        isActive
          ? "border-accent-9 bg-accent-3"
          : "border-gray-6 border-dashed bg-gray-3 hover:bg-gray-4"
      }`}
      style={{
        height: ITEM_HEIGHT,
        width: ITEM_WIDTH,
        boxShadow: isActive
          ? "0 0 16px color-mix(in srgb, var(--accent-9), transparent 70%)"
          : undefined,
      }}
    >
      <span className="flex shrink-0 items-center justify-center">
        <PlusIcon size={ICON_SIZE} className="text-gray-10" />
      </span>
      <span
        className={`text-[13px] ${
          isActive ? "font-medium text-gray-12" : "text-gray-11"
        }`}
      >
        New task
      </span>
    </button>
  );
});

export function SpaceSwitcher({
  tasks,
  activeTaskId,
  allTasks,
  isOnNewTask,
  onNavigateToTask,
  onNewTask,
}: SpaceSwitcherProps) {
  // mounted = DOM present, animIn = opacity target.
  // Mount first, then set animIn on next frame for CSS transition.
  const [mounted, setMounted] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const metaHeldRef = useRef(false);
  const showTimerRef = useRef<number | undefined>(undefined);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const unmountTimerRef = useRef<number | undefined>(undefined);
  const otherKeyRef = useRef(false);

  const show = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    clearTimeout(unmountTimerRef.current);
    setMounted(true);
    // Next frame: trigger CSS transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimIn(true));
    });
  }, []);

  const hide = useCallback(() => {
    setAnimIn(false);
    // Unmount after transition (200ms)
    unmountTimerRef.current = window.setTimeout(() => {
      setMounted(false);
    }, 200);
  }, []);

  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of allTasks) {
      map.set(task.id, task);
    }
    return map;
  }, [allTasks]);

  // Slot 0 = new task, slots 1..n = tasks, -1 = no active slot
  const totalSlots = tasks.length + 1;
  const currentSlot = isOnNewTask
    ? 0
    : activeTaskId !== null
      ? tasks.findIndex((t) => t.id === activeTaskId) + 1
      : -1;

  const navigateToSlot = useCallback(
    (slot: number) => {
      if (slot === 0) {
        onNewTask();
      } else {
        const taskData = tasks[slot - 1];
        const task = taskData ? taskById.get(taskData.id) : undefined;
        if (task) onNavigateToTask(task);
      }
    },
    [tasks, taskById, onNavigateToTask, onNewTask],
  );

  const navigatePrev = useCallback(() => {
    if (tasks.length === 0) return;
    // No active slot → go to last task
    if (currentSlot === -1) {
      navigateToSlot(totalSlots - 1);
      return;
    }
    const prev = currentSlot <= 0 ? totalSlots - 1 : currentSlot - 1;
    navigateToSlot(prev);
  }, [tasks.length, totalSlots, currentSlot, navigateToSlot]);

  const navigateNext = useCallback(() => {
    if (tasks.length === 0) return;
    // No active slot → go to first (new task)
    if (currentSlot === -1) {
      navigateToSlot(0);
      return;
    }
    const next = currentSlot >= totalSlots - 1 ? 0 : currentSlot + 1;
    navigateToSlot(next);
  }, [tasks.length, totalSlots, currentSlot, navigateToSlot]);

  const handleItemClick = useCallback(
    (taskId: string) => {
      const task = taskById.get(taskId);
      if (task) onNavigateToTask(task);
    },
    [taskById, onNavigateToTask],
  );

  // Meta key hold detection — only pure hold (no other keys) shows minimap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === MOD_KEY && !e.repeat) {
        // Suppress while a tour is active or Shift is held (screenshot shortcut).
        if (e.shiftKey || document.body.classList.contains("tour-active")) {
          return;
        }
        metaHeldRef.current = true;
        otherKeyRef.current = false;
        clearTimeout(hideTimerRef.current);
        clearTimeout(unmountTimerRef.current);
        showTimerRef.current = window.setTimeout(() => {
          if (metaHeldRef.current && !otherKeyRef.current) {
            show();
          }
        }, HOLD_DELAY_MS);
      } else if (metaHeldRef.current && !e.repeat) {
        // Any key during hold cancels the show timer.
        // Minimap only appears from a pure Cmd hold with no other keys.
        otherKeyRef.current = true;
        clearTimeout(showTimerRef.current);
        // Shift during hold = screenshot intent. Hide if already shown.
        if (e.key === "Shift") {
          hide();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === MOD_KEY) {
        metaHeldRef.current = false;
        clearTimeout(showTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          hide();
        }, 100);
      }
    };

    const handleBlur = () => {
      metaHeldRef.current = false;
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      setAnimIn(false);
      setMounted(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      clearTimeout(unmountTimerRef.current);
    };
  }, [show, hide]);

  useHotkeys(
    SHORTCUTS.SPACE_UP,
    (e) => {
      if (!mounted && isInputWithContent()) return;
      e.preventDefault();
      navigatePrev();
    },
    SPACE_HOTKEY_OPTIONS,
    [navigatePrev, mounted],
  );
  useHotkeys(
    SHORTCUTS.SPACE_DOWN,
    (e) => {
      if (!mounted && isInputWithContent()) return;
      e.preventDefault();
      navigateNext();
    },
    SPACE_HOTKEY_OPTIONS,
    [navigateNext, mounted],
  );
  useHotkeys(
    SHORTCUTS.BLUR,
    (e) => {
      e.preventDefault();
      hide();
    },
    { ...SPACE_HOTKEY_OPTIONS, enabled: mounted },
    [hide, mounted],
  );

  if (!mounted || tasks.length === 0) return null;

  const centerOffset = CONTAINER_HEIGHT / 2 - ITEM_HEIGHT / 2;
  const centeredSlot = currentSlot === -1 ? 0 : currentSlot;
  const translateY = centerOffset - centeredSlot * ITEM_STRIDE;

  return (
    <div
      data-overlay="space-switcher"
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ease-out ${
        animIn ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Vertical list with fade edges */}
      <div
        className="relative overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-2xl backdrop-blur-xl"
        style={{
          height: CONTAINER_HEIGHT,
          width: ITEM_WIDTH + 24,
        }}
      >
        <div className="absolute inset-0" style={MASK_STYLE}>
          <div
            className="flex flex-col p-3"
            style={{
              gap: ITEM_GAP,
              transform: `translateY(${translateY}px)`,
              transition: "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            <NewTaskItem isActive={currentSlot === 0} onClick={onNewTask} />
            {tasks.map((task, index) => (
              <SpaceItem
                key={task.id}
                task={task}
                isActive={currentSlot > 0 && task.id === activeTaskId}
                index={index}
                onClick={() => handleItemClick(task.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
