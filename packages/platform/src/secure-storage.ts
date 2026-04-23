export interface ISecureStorage {
  isAvailable(): boolean;
  encryptString(text: string): Promise<Uint8Array>;
  decryptString(data: Uint8Array): Promise<string>;
}
