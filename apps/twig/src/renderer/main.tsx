import "reflect-metadata";
import "@radix-ui/themes/styles.css";
import { Providers } from "@components/Providers";
import App from "@renderer/App";
import { logger } from "@renderer/lib/logger";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";

import { useAuthStore } from "@features/auth/stores/authStore";

const log = logger.scope("app");
log.info("Twig renderer booting up");

// Dev tool: allow main process menu to trigger OAuth token refresh
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__devTriggerTokenRefresh =
    () => {
      log.info("Dev: triggering token refresh from menu");
      useAuthStore.getState().refreshAccessToken();
    };
}

document.title = import.meta.env.DEV ? "Twig (Development)" : "Twig";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
