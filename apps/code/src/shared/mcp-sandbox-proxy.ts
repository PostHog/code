/**
 * Sandbox proxy HTML for MCP Apps.
 *
 * This is the intermediate layer in the double-iframe architecture:
 *
 *   Host (renderer) → Outer iframe (sandbox proxy) → Inner iframe (MCP App)
 *
 * The outer iframe is served from the `mcp-sandbox:` custom protocol, giving it
 * an isolated origin separate from the renderer. The inner iframe uses
 * allow-same-origin so the proxy can write HTML via document.write() — srcdoc
 * creates an opaque origin that breaks WebGL canvas operations (toDataURL) and
 * cross-origin resource access.
 *
 * Because the proxy's origin (`mcp-sandbox://proxy`) differs from the
 * renderer's origin, the app cannot traverse `window.parent.parent` to access
 * the host's DOM, storage, or cookies.
 *
 * @see https://modelcontextprotocol.io/specification/2025-03-26/extensions/mcp-apps
 */

import html from "./mcp-sandbox-proxy.html?raw";

export const sandboxProxyHtml: string = html;
