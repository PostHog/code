import "reflect-metadata";
import { Container } from "inversify";
import { ArchiveRepository } from "../db/repositories/archive-repository";
import { RepositoryRepository } from "../db/repositories/repository-repository";
import { SuspensionRepositoryImpl } from "../db/repositories/suspension-repository.js";
import { WorkspaceRepository } from "../db/repositories/workspace-repository";
import { WorktreeRepository } from "../db/repositories/worktree-repository";
import { DatabaseService } from "../db/service";
import { AgentService } from "../services/agent/service";
import { AppLifecycleService } from "../services/app-lifecycle/service";
import { ArchiveService } from "../services/archive/service";
import { AuthProxyService } from "../services/auth-proxy/service";
import { CloudTaskService } from "../services/cloud-task/service";
import { ConnectivityService } from "../services/connectivity/service";
import { ContextMenuService } from "../services/context-menu/service";
import { DeepLinkService } from "../services/deep-link/service";
import { ExternalAppsService } from "../services/external-apps/service";
import { FileWatcherService } from "../services/file-watcher/service";
import { FocusService } from "../services/focus/service";
import { FocusSyncService } from "../services/focus/sync-service";
import { FoldersService } from "../services/folders/service";
import { FsService } from "../services/fs/service";
import { GitService } from "../services/git/service";
import { GitHubIntegrationService } from "../services/github-integration/service";
import { LinearIntegrationService } from "../services/linear-integration/service";
import { LlmGatewayService } from "../services/llm-gateway/service";
import { McpCallbackService } from "../services/mcp-callback/service";
import { NotificationService } from "../services/notification/service";
import { OAuthService } from "../services/oauth/service";
import { PosthogPluginService } from "../services/posthog-plugin/service";
import { ProcessTrackingService } from "../services/process-tracking/service";
import { settingsStore } from "../services/settingsStore";
import { ShellService } from "../services/shell/service";
import { SleepService } from "../services/sleep/service";
import { SuspensionService } from "../services/suspension/service.js";
import { TaskLinkService } from "../services/task-link/service";
import { UIService } from "../services/ui/service";
import { UpdatesService } from "../services/updates/service";
import { WatcherRegistryService } from "../services/watcher-registry/service";
import { WorkspaceService } from "../services/workspace/service";
import { MAIN_TOKENS } from "./tokens";

export const container = new Container({
  defaultScope: "Singleton",
});

container.bind(MAIN_TOKENS.DatabaseService).to(DatabaseService);
container.bind(MAIN_TOKENS.RepositoryRepository).to(RepositoryRepository);
container.bind(MAIN_TOKENS.WorkspaceRepository).to(WorkspaceRepository);
container.bind(MAIN_TOKENS.WorktreeRepository).to(WorktreeRepository);
container.bind(MAIN_TOKENS.ArchiveRepository).to(ArchiveRepository);
container.bind(MAIN_TOKENS.SuspensionRepository).to(SuspensionRepositoryImpl);
container.bind(MAIN_TOKENS.AgentService).to(AgentService);
container.bind(MAIN_TOKENS.AuthProxyService).to(AuthProxyService);
container.bind(MAIN_TOKENS.ArchiveService).to(ArchiveService);
container.bind(MAIN_TOKENS.SuspensionService).to(SuspensionService);
container.bind(MAIN_TOKENS.AppLifecycleService).to(AppLifecycleService);
container.bind(MAIN_TOKENS.CloudTaskService).to(CloudTaskService);
container.bind(MAIN_TOKENS.ConnectivityService).to(ConnectivityService);
container.bind(MAIN_TOKENS.ContextMenuService).to(ContextMenuService);
container.bind(MAIN_TOKENS.DeepLinkService).to(DeepLinkService);

container.bind(MAIN_TOKENS.ExternalAppsService).to(ExternalAppsService);
container.bind(MAIN_TOKENS.LlmGatewayService).to(LlmGatewayService);
container.bind(MAIN_TOKENS.FileWatcherService).to(FileWatcherService);
container.bind(MAIN_TOKENS.FocusService).to(FocusService);
container.bind(MAIN_TOKENS.FocusSyncService).to(FocusSyncService);
container.bind(MAIN_TOKENS.FoldersService).to(FoldersService);
container.bind(MAIN_TOKENS.FsService).to(FsService);
container
  .bind(MAIN_TOKENS.GitHubIntegrationService)
  .to(GitHubIntegrationService);
container.bind(MAIN_TOKENS.GitService).to(GitService);
container
  .bind(MAIN_TOKENS.LinearIntegrationService)
  .to(LinearIntegrationService);
container.bind(MAIN_TOKENS.McpCallbackService).to(McpCallbackService);
container.bind(MAIN_TOKENS.NotificationService).to(NotificationService);
container.bind(MAIN_TOKENS.OAuthService).to(OAuthService);
container.bind(MAIN_TOKENS.ProcessTrackingService).to(ProcessTrackingService);
container.bind(MAIN_TOKENS.PosthogPluginService).to(PosthogPluginService);
container.bind(MAIN_TOKENS.SleepService).to(SleepService);
container.bind(MAIN_TOKENS.ShellService).to(ShellService);
container.bind(MAIN_TOKENS.UIService).to(UIService);
container.bind(MAIN_TOKENS.UpdatesService).to(UpdatesService);
container.bind(MAIN_TOKENS.TaskLinkService).to(TaskLinkService);
container.bind(MAIN_TOKENS.WatcherRegistryService).to(WatcherRegistryService);
container.bind(MAIN_TOKENS.WorkspaceService).to(WorkspaceService);

container.bind(MAIN_TOKENS.SettingsStore).toConstantValue(settingsStore);
