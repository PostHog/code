import {
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { SerializedEnrichment } from "@posthog/enricher";
import {
  type EnrichmentPopoverEntry,
  useEnrichmentPopoverStore,
} from "../stores/enrichmentPopoverStore";

export const setEnrichmentEffect =
  StateEffect.define<SerializedEnrichment | null>();

interface Occurrence {
  /** 1-indexed CodeMirror line number. */
  line: number;
  startCol: number;
  endCol: number;
  entry: EnrichmentPopoverEntry;
  summary: string;
}

function buildOccurrences(data: SerializedEnrichment | null): Occurrence[] {
  if (!data) return [];
  const out: Occurrence[] = [];

  for (const flag of data.flags) {
    for (const occ of flag.occurrences) {
      out.push({
        line: occ.line + 1,
        startCol: occ.startCol,
        endCol: occ.endCol,
        entry: { kind: "flag", data: flag },
        summary: `Flag: ${flag.flagKey}`,
      });
    }
  }
  for (const event of data.events) {
    for (const occ of event.occurrences) {
      out.push({
        line: occ.line + 1,
        startCol: occ.startCol,
        endCol: occ.endCol,
        entry: { kind: "event", data: event },
        summary: `Event: ${event.eventName}`,
      });
    }
  }

  // RangeSetBuilder requires ranges in document order.
  out.sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.startCol - b.startCol,
  );
  return out;
}

const enrichmentField = StateField.define<Occurrence[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEnrichmentEffect)) {
        return buildOccurrences(effect.value);
      }
    }
    return value;
  },
});

const pillStyles = EditorView.baseTheme({
  ".cm-posthog-pill": {
    backgroundColor:
      "color-mix(in srgb, var(--accent-9, #6b46c1) 18%, transparent)",
    borderRadius: "3px",
    padding: "0 3px",
    margin: "0 -3px",
    boxShadow:
      "inset 0 0 0 1px color-mix(in srgb, var(--accent-9, #6b46c1) 40%, transparent)",
    cursor: "pointer",
  },
  ".cm-posthog-pill:hover": {
    backgroundColor:
      "color-mix(in srgb, var(--accent-9, #6b46c1) 30%, transparent)",
  },
});

function openPopoverFor(view: EditorView, occurrence: Occurrence): void {
  const line = view.state.doc.line(occurrence.line);
  const from = Math.min(line.from + occurrence.startCol, line.to);
  const to = Math.min(line.from + occurrence.endCol, line.to);
  const start = view.coordsAtPos(from);
  if (!start) return;
  const end = view.coordsAtPos(to) ?? start;
  useEnrichmentPopoverStore.getState().show(
    {
      top: start.top,
      bottom: start.bottom,
      left: start.left,
      right: end.right,
    },
    occurrence.entry,
  );
}

const pillPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      const prev = update.startState.field(enrichmentField, false);
      const next = update.state.field(enrichmentField, false);
      if (prev !== next || update.docChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const occurrences = view.state.field(enrichmentField, false) ?? [];
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      for (const occ of occurrences) {
        if (occ.line < 1 || occ.line > doc.lines) continue;
        const line = doc.line(occ.line);
        const from = line.from + Math.max(0, occ.startCol);
        const to = line.from + Math.max(occ.startCol, occ.endCol);
        if (to <= from || to > line.to) continue;
        builder.add(
          from,
          to,
          Decoration.mark({
            class: "cm-posthog-pill",
            attributes: {
              "data-posthog-pill": "1",
              title: occ.summary,
            },
          }),
        );
      }
      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event, view) {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const pill = target.closest<HTMLElement>("[data-posthog-pill]");
        if (!pill) return false;
        const pos = view.posAtDOM(pill);
        const occurrences = view.state.field(enrichmentField, false) ?? [];
        const line = view.state.doc.lineAt(pos).number;
        const col = pos - view.state.doc.line(line).from;
        const match = occurrences.find(
          (o) => o.line === line && col >= o.startCol && col <= o.endCol,
        );
        if (!match) return false;
        event.preventDefault();
        event.stopPropagation();
        openPopoverFor(view, match);
        return true;
      },
    },
  },
);

export function postHogEnrichmentExtension(): Extension {
  return [enrichmentField, pillPlugin, pillStyles];
}
