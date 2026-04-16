import "@main/services/types";

// No legacy IPC interfaces - all communication now uses tRPC

declare global {
  interface Window {
    electronUtils?: {
      getPathForFile: (file: File) => string;
    };
  }
}
