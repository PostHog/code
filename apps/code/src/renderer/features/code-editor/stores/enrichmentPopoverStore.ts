import type { SerializedEvent, SerializedFlag } from "@posthog/enricher";
import { create } from "zustand";

export type EnrichmentPopoverEntry =
  | { kind: "flag"; data: SerializedFlag }
  | { kind: "event"; data: SerializedEvent };

export interface PopoverAnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface EnrichmentPopoverState {
  open: boolean;
  anchorRect: PopoverAnchorRect | null;
  entry: EnrichmentPopoverEntry | null;
  show: (rect: PopoverAnchorRect, entry: EnrichmentPopoverEntry) => void;
  close: () => void;
}

export const useEnrichmentPopoverStore = create<EnrichmentPopoverState>(
  (set) => ({
    open: false,
    anchorRect: null,
    entry: null,
    show: (rect, entry) => set({ open: true, anchorRect: rect, entry }),
    close: () => set({ open: false, entry: null, anchorRect: null }),
  }),
);
