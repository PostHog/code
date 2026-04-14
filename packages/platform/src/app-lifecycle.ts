export interface IAppLifecycle {
  whenReady(): Promise<void>;
  quit(): void;
  exit(code?: number): void;
  onQuit(handler: () => void | Promise<void>): () => void;
  registerDeepLinkScheme(scheme: string): void;
}
