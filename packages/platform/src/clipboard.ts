export interface IClipboard {
  writeText(text: string): Promise<void>;
}
