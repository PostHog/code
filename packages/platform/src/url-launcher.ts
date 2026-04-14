export interface IUrlLauncher {
  launch(url: string): Promise<void>;
}
