export interface IMainWindow {
  focus(): void;
  isFocused(): boolean;
  isMinimized(): boolean;
  restore(): void;
  onFocus(handler: () => void): () => void;
}
