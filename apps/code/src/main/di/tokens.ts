/**
 * Main process DI tokens.
 *
 * IMPORTANT: These tokens are for main process only.
 * Never import this file from renderer code.
 */
export const MAIN_TOKENS = Object.freeze({
  // Stores
  SettingsStore: Symbol.for("Main.SettingsStore"),

  // Database
  DatabaseService: Symbol.for("Main.DatabaseService"),
  RepositoryRepository: Symbol.for("Main.RepositoryRepository"),
  WorkspaceRepository: Symbol.for("Main.WorkspaceRepository"),
  WorktreeRepository: Symbol.for("Main.WorktreeRepository"),
  ArchiveRepository: Symbol.for("Main.ArchiveRepository"),
  SuspensionRepository: Symbol.for("Main.SuspensionRepository"),

  // Services
  AgentService: Symbol.for("Main.AgentService"),
  AuthProxyService: Symbol.for("Main.AuthProxyService"),
  ArchiveService: Symbol.for("Main.ArchiveService"),
  SuspensionService: Symbol.for("Main.SuspensionService"),
  AppLifecycleService: Symbol.for("Main.AppLifecycleService"),
  CloudTaskService: Symbol.for("Main.CloudTaskService"),
  ConnectivityService: Symbol.for("Main.ConnectivityService"),
  ContextMenuService: Symbol.for("Main.ContextMenuService"),

  ExternalAppsService: Symbol.for("Main.ExternalAppsService"),
  LlmGatewayService: Symbol.for("Main.LlmGatewayService"),
  McpAppsService: Symbol.for("Main.McpAppsService"),
  FileWatcherService: Symbol.for("Main.FileWatcherService"),
  FocusService: Symbol.for("Main.FocusService"),
  FocusSyncService: Symbol.for("Main.FocusSyncService"),
  FoldersService: Symbol.for("Main.FoldersService"),
  FsService: Symbol.for("Main.FsService"),
  GitService: Symbol.for("Main.GitService"),
  GitHubIntegrationService: Symbol.for("Main.GitHubIntegrationService"),
  LinearIntegrationService: Symbol.for("Main.LinearIntegrationService"),
  DeepLinkService: Symbol.for("Main.DeepLinkService"),
  NotificationService: Symbol.for("Main.NotificationService"),
  McpCallbackService: Symbol.for("Main.McpCallbackService"),
  OAuthService: Symbol.for("Main.OAuthService"),
  ProcessTrackingService: Symbol.for("Main.ProcessTrackingService"),
  SleepService: Symbol.for("Main.SleepService"),
  ShellService: Symbol.for("Main.ShellService"),
  PosthogPluginService: Symbol.for("Main.PosthogPluginService"),
  UIService: Symbol.for("Main.UIService"),
  UpdatesService: Symbol.for("Main.UpdatesService"),
  TaskLinkService: Symbol.for("Main.TaskLinkService"),
  WatcherRegistryService: Symbol.for("Main.WatcherRegistryService"),
  EnvironmentService: Symbol.for("Main.EnvironmentService"),
  ProvisioningService: Symbol.for("Main.ProvisioningService"),
  WorkspaceService: Symbol.for("Main.WorkspaceService"),
});
