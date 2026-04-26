import type React from "react";

/**
 * TypeScript type augmentation for Electron's `<webview>` tag, which is not
 * part of the standard React/JSX type definitions. We only declare the props
 * we actually use; add more as needed.
 *
 * The webview tag also exposes imperative methods (reload, loadURL, etc.) on
 * the underlying DOM element. Cast `ref.current` to `Electron.WebviewTag`
 * (declared by Electron's own types) when calling them.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
          useragent?: string;
          httpreferrer?: string;
          preload?: string;
        },
        HTMLElement
      >;
    }
  }
}
