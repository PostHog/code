import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import type { Tab } from "@features/panels/store/panelTypes";
import { PreviewPanel } from "@features/preview/components/PreviewPanel";
import { ActionPanel } from "@features/task-detail/components/ActionPanel";
import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import { useIsWorkspaceCloudRun } from "@features/workspace/hooks/useWorkspace";
import { CloudReviewPage } from "@renderer/features/code-review/components/CloudReviewPage";
import { ReviewPage } from "@renderer/features/code-review/components/ReviewPage";
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
  const isCloud = useIsWorkspaceCloudRun(taskId);
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

    case "review": {
      return isCloud ? (
        <CloudReviewPage task={task} />
      ) : (
        <ReviewPage task={task} />
      );
    }

    case "action":
      return (
        <ActionPanel
          taskId={taskId}
          actionId={data.actionId}
          command={data.command}
          cwd={data.cwd}
        />
      );

    case "preview":
      return <PreviewPanel previewName={data.previewName} url={data.url} />;

    case "other":
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
