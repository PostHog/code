import "@main/services/types";

declare global {
  interface Window {
    electronUtils?: {
      getPathForFile: (file: File) => string;
    };
  }
}
