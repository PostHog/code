import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import type { Tab } from "@features/panels/store/panelTypes";
import { ActionPanel } from "@features/task-detail/components/ActionPanel";
import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import type { Task } from "@shared/types";

interface TabContentRendererProps {
  tab: Tab;
  taskId: string;
  task: Task;
}

export function TabContentRenderer({
  tab,
  taskId,
  task,
}: TabContentRendererProps) {
  const { data } = tab;

  switch (data.type) {
    case "logs":
      return <TaskLogsPanel taskId={taskId} task={task} />;

    case "terminal":
      return (
        <TaskShellPanel taskId={taskId} task={task} shellId={data.terminalId} />
      );

    case "file":
      return (
        <CodeEditorPanel
          taskId={taskId}
          task={task}
          absolutePath={data.absolutePath}
        />
      );

    case "action":
      return (
        <ActionPanel
          taskId={taskId}
          actionId={data.actionId}
          command={data.command}
          cwd={data.cwd}
        />
      );

    case "other":
      // Handle system tabs by ID
      // TODO: These should all have their own type as well
      switch (tab.id) {
        case "files":
          return <FileTreePanel taskId={taskId} task={task} />;
        case "changes":
          return <ChangesPanel taskId={taskId} task={task} />;
        default:
          return <div>Unknown tab: {tab.id}</div>;
      }

    default:
      return <div>Unknown tab type</div>;
  }
}
