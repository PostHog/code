const OVERLAY_SELECTORS = [
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[data-radix-popper-content-wrapper]",
  "[data-overlay]",
].join(",");

export function hasOpenOverlay(): boolean {
  return document.querySelector(OVERLAY_SELECTORS) !== null;
}
