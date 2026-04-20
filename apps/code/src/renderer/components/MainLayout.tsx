import { ConnectivityPrompt } from "@components/ConnectivityPrompt";
import { HeaderRow } from "@components/HeaderRow";
import { HedgehogMode } from "@components/HedgehogMode";
import { KeyboardShortcutsSheet } from "@components/KeyboardShortcutsSheet";

import { ArchivedTasksView } from "@features/archive/components/ArchivedTasksView";
import { CommandMenu } from "@features/command/components/CommandMenu";
import { CommandCenterView } from "@features/command-center/components/CommandCenterView";
import { InboxView } from "@features/inbox/components/InboxView";
import { FolderSettingsView } from "@features/settings/components/FolderSettingsView";
import { SettingsDialog } from "@features/settings/components/SettingsDialog";
import { MainSidebar } from "@features/sidebar/components/MainSidebar";
import { SkillsView } from "@features/skills/components/SkillsView";
import { TaskDetail } from "@features/task-detail/components/TaskDetail";
import { TaskInput } from "@features/task-detail/components/TaskInput";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useConnectivity } from "@hooks/useConnectivity";
import { useIntegrations } from "@hooks/useIntegrations";
import { Box, Flex } from "@radix-ui/themes";
import { useCommandMenuStore } from "@stores/commandMenuStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useShortcutsSheetStore } from "@stores/shortcutsSheetStore";
import { useCallback, useEffect } from "react";
import { useTaskDeepLink } from "../hooks/useTaskDeepLink";
import { GlobalEventHandlers } from "./GlobalEventHandlers";

export function MainLayout() {
  const { view, hydrateTask, navigateToTaskInput } = useNavigationStore();
  const {
    isOpen: commandMenuOpen,
    setOpen: setCommandMenuOpen,
    toggle: toggleCommandMenu,
  } = useCommandMenuStore();
  const {
    isOpen: shortcutsSheetOpen,
    toggle: toggleShortcutsSheet,
    close: closeShortcutsSheet,
  } = useShortcutsSheetStore();
  const { data: tasks } = useTasks();
  const { showPrompt, isChecking, check, dismiss } = useConnectivity();

  useIntegrations();
  useTaskDeepLink();

  useEffect(() => {
    if (tasks) {
      hydrateTask(tasks);
    }
  }, [tasks, hydrateTask]);

  useEffect(() => {
    if (view.type === "task-detail" && !view.data && !view.taskId) {
      navigateToTaskInput();
    }
  }, [view, navigateToTaskInput]);

  const handleToggleCommandMenu = useCallback(() => {
    toggleCommandMenu();
  }, [toggleCommandMenu]);

  return (
    <Flex direction="column" height="100vh">
      <HeaderRow />
      <Flex flexGrow="1" overflow="hidden">
        <MainSidebar />

        <Box flexGrow="1" overflow="hidden">
          {view.type === "task-input" && <TaskInput />}

          {view.type === "task-detail" && view.data && (
            <TaskDetail key={view.data.id} task={view.data} />
          )}

          {view.type === "folder-settings" && <FolderSettingsView />}

          {view.type === "inbox" && <InboxView />}

          {view.type === "archived" && <ArchivedTasksView />}

          {view.type === "command-center" && <CommandCenterView />}

          {view.type === "skills" && <SkillsView />}
        </Box>
      </Flex>

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      <KeyboardShortcutsSheet
        open={shortcutsSheetOpen}
        onOpenChange={(open) => (open ? null : closeShortcutsSheet())}
      />
      <ConnectivityPrompt
        open={showPrompt}
        isChecking={isChecking}
        onRetry={check}
        onDismiss={dismiss}
      />
      <GlobalEventHandlers
        onToggleCommandMenu={handleToggleCommandMenu}
        onToggleShortcutsSheet={toggleShortcutsSheet}
      />
      <SettingsDialog />
      <HedgehogMode />
    </Flex>
  );
}
