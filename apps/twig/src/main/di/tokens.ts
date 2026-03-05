/**
 * Main process DI tokens.
 *
 * IMPORTANT: These tokens are for main process only.
 * Never import this file from renderer code.
 */
export const MAIN_TOKENS = Object.freeze({
  // Stores
  ArchiveStore: Symbol.for("Main.ArchiveStore"),
  FoldersStore: Symbol.for("Main.FoldersStore"),
  SettingsStore: Symbol.for("Main.SettingsStore"),

  // Services
  AgentService: Symbol.for("Main.AgentService"),
  ArchiveService: Symbol.for("Main.ArchiveService"),
  AppLifecycleService: Symbol.for("Main.AppLifecycleService"),
  CloudTaskService: Symbol.for("Main.CloudTaskService"),
  ConnectivityService: Symbol.for("Main.ConnectivityService"),
  ContextMenuService: Symbol.for("Main.ContextMenuService"),

  ExternalAppsService: Symbol.for("Main.ExternalAppsService"),
  LlmGatewayService: Symbol.for("Main.LlmGatewayService"),
  FileWatcherService: Symbol.for("Main.FileWatcherService"),
  FocusService: Symbol.for("Main.FocusService"),
  FocusSyncService: Symbol.for("Main.FocusSyncService"),
  FoldersService: Symbol.for("Main.FoldersService"),
  FsService: Symbol.for("Main.FsService"),
  GitService: Symbol.for("Main.GitService"),
  GitHubIntegrationService: Symbol.for("Main.GitHubIntegrationService"),
  DeepLinkService: Symbol.for("Main.DeepLinkService"),
  NotificationService: Symbol.for("Main.NotificationService"),
  OAuthService: Symbol.for("Main.OAuthService"),
  ProcessTrackingService: Symbol.for("Main.ProcessTrackingService"),
  SleepService: Symbol.for("Main.SleepService"),
  ShellService: Symbol.for("Main.ShellService"),
  PosthogPluginService: Symbol.for("Main.PosthogPluginService"),
  UIService: Symbol.for("Main.UIService"),
  UpdatesService: Symbol.for("Main.UpdatesService"),
  TaskLinkService: Symbol.for("Main.TaskLinkService"),
  WatcherRegistryService: Symbol.for("Main.WatcherRegistryService"),
  WorkspaceService: Symbol.for("Main.WorkspaceService"),
});
