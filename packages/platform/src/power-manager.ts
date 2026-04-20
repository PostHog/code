export interface IPowerManager {
  onResume(handler: () => void): () => void;
  preventSleep(reason: string): () => void;
}
