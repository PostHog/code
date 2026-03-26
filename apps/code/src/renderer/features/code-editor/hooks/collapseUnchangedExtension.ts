import { getChunks, mergeViewSiblings } from "@codemirror/merge";
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";

const EXPAND_LINES = 20;

export interface CollapsedRange {
  /** First collapsed line number (1-based) */
  fromLine: number;
  /** Last collapsed line number (1-based) */
  toLine: number;
}

export const expandUp = StateEffect.define<{ pos: number; lines: number }>();
export const expandDown = StateEffect.define<{ pos: number; lines: number }>();
export const expandAll = StateEffect.define<number>();

class ExpandWidget extends WidgetType {
  constructor(
    readonly collapsedLines: number,
    readonly showUp: boolean,
    readonly showDown: boolean,
  ) {
    super();
  }

  eq(other: ExpandWidget) {
    return (
      this.collapsedLines === other.collapsedLines &&
      this.showUp === other.showUp &&
      this.showDown === other.showDown
    );
  }

  toDOM(view: EditorView) {
    const outer = document.createElement("div");
    outer.className = "cm-collapsed-context";

    // Left gutter area with stacked arrows (GitHub-style)
    const gutterArea = document.createElement("div");
    gutterArea.className = "cm-collapsed-gutter";

    if (this.showUp) {
      const upButton = document.createElement("button");
      upButton.className = "cm-collapsed-expand-btn";
      upButton.title = `Expand ${Math.min(EXPAND_LINES, this.collapsedLines)} lines up`;
      upButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.47 7.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 3.81 3.97 7.78a.75.75 0 0 1-1.06 0Z"/><path d="M3.47 12.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 8.31l-4.03 3.97a.75.75 0 0 1-1.06 0Z"/></svg>`;
      upButton.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(outer);
        view.dispatch({ effects: expandUp.of({ pos, lines: EXPAND_LINES }) });
        syncSibling(view, expandUp, pos, EXPAND_LINES);
      });
      gutterArea.appendChild(upButton);
    }

    if (this.showDown) {
      const downButton = document.createElement("button");
      downButton.className = "cm-collapsed-expand-btn";
      downButton.title = `Expand ${Math.min(EXPAND_LINES, this.collapsedLines)} lines down`;
      downButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.53 8.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L2.97 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 12.19l4.03-3.97a.75.75 0 0 1 1.06 0Z"/><path d="M12.53 3.72a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L2.97 4.78a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 7.69l4.03-3.97a.75.75 0 0 1 1.06 0Z"/></svg>`;
      downButton.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(outer);
        view.dispatch({ effects: expandDown.of({ pos, lines: EXPAND_LINES }) });
        syncSibling(view, expandDown, pos, EXPAND_LINES);
      });
      gutterArea.appendChild(downButton);
    }

    outer.appendChild(gutterArea);

    // Label area
    const label = document.createElement("span");
    label.className = "cm-collapsed-label";
    label.textContent = `${this.collapsedLines} unchanged lines`;
    label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(outer);
      view.dispatch({ effects: expandAll.of(pos) });
      syncSibling(view, expandAll, pos);
    });
    outer.appendChild(label);

    return outer;
  }

  ignoreEvent(e: Event) {
    return e instanceof MouseEvent;
  }

  get estimatedHeight() {
    return 33;
  }
}

function syncSibling(
  view: EditorView,
  effect: typeof expandUp | typeof expandDown,
  pos: number,
  lines?: number,
): void;
function syncSibling(
  view: EditorView,
  effect: typeof expandAll,
  pos: number,
): void;
function syncSibling(
  view: EditorView,
  effect: typeof expandUp | typeof expandDown | typeof expandAll,
  pos: number,
  lines?: number,
): void {
  const siblings = mergeViewSiblings(view);
  if (!siblings) return;

  const info = getChunks(view.state);
  if (!info) return;

  const otherView = siblings.a === view ? siblings.b : siblings.a;
  const mappedPos = mapPosBetweenSides(pos, info.chunks, info.side === "a");

  if (effect === expandAll) {
    otherView.dispatch({ effects: expandAll.of(mappedPos) });
  } else if (lines !== undefined) {
    otherView.dispatch({
      effects: (effect as typeof expandUp | typeof expandDown).of({
        pos: mappedPos,
        lines,
      }),
    });
  }
}

export function mapPosBetweenSides(
  pos: number,
  chunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[],
  isA: boolean,
): number {
  let startOur = 0;
  let startOther = 0;
  for (let i = 0; ; i++) {
    const next = i < chunks.length ? chunks[i] : null;
    if (!next || (isA ? next.fromA : next.fromB) >= pos) {
      return startOther + (pos - startOur);
    }
    [startOur, startOther] = isA ? [next.toA, next.toB] : [next.toB, next.toA];
  }
}

export function buildDecorations(
  state: EditorState,
  ranges: CollapsedRange[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    if (range.fromLine > range.toLine) continue;
    const lines = range.toLine - range.fromLine + 1;
    const from = state.doc.line(range.fromLine).from;
    const to = state.doc.line(range.toLine).to;
    const isFirst = range.fromLine === 1;
    const isLast = range.toLine === state.doc.lines;
    builder.add(
      from,
      to,
      Decoration.replace({
        widget: new ExpandWidget(lines, !isFirst, !isLast),
        block: true,
      }),
    );
  }
  return builder.finish();
}

export function computeInitialRanges(
  state: EditorState,
  margin: number,
  minSize: number,
): CollapsedRange[] {
  const info = getChunks(state);
  if (!info) return [];

  const { chunks, side } = info;
  const isA = side === "a";
  const ranges: CollapsedRange[] = [];
  let prevLine = 1;

  for (let i = 0; ; i++) {
    const chunk = i < chunks.length ? chunks[i] : null;
    const collapseFrom = i ? prevLine + margin : 1;
    const collapseTo = chunk
      ? state.doc.lineAt(isA ? chunk.fromA : chunk.fromB).number - 1 - margin
      : state.doc.lines;
    const lines = collapseTo - collapseFrom + 1;

    if (lines >= minSize) {
      ranges.push({ fromLine: collapseFrom, toLine: collapseTo });
    }

    if (!chunk) break;
    prevLine = state.doc.lineAt(
      Math.min(state.doc.length, isA ? chunk.toA : chunk.toB),
    ).number;
  }

  return ranges;
}

export function applyExpandEffect(
  ranges: CollapsedRange[],
  state: EditorState,
  effect: StateEffect<unknown>,
): CollapsedRange[] {
  const isAll = effect.is(expandAll);
  const isUp = effect.is(expandUp);
  const isDown = effect.is(expandDown);

  const pos = isAll
    ? (effect.value as number)
    : (effect.value as { pos: number; lines: number }).pos;

  return ranges.flatMap((range) => {
    const from = state.doc.line(range.fromLine).from;
    const to = state.doc.line(range.toLine).to;
    if (pos < from || pos > to) return [range];

    if (isAll) return [];

    const { lines } = effect.value as { pos: number; lines: number };

    if (isDown) {
      const newFrom = range.fromLine + lines;
      if (newFrom > range.toLine) return [];
      return [{ fromLine: newFrom, toLine: range.toLine }];
    }

    if (isUp) {
      const newTo = range.toLine - lines;
      if (newTo < range.fromLine) return [];
      return [{ fromLine: range.fromLine, toLine: newTo }];
    }

    return [range];
  });
}

export function gradualCollapseUnchanged({
  margin = 3,
  minSize = 4,
}: {
  margin?: number;
  minSize?: number;
} = {}): Extension {
  const collapsedField = StateField.define<{
    ranges: CollapsedRange[];
    deco: DecorationSet;
  }>({
    create(state) {
      const ranges = computeInitialRanges(state, margin, minSize);
      return { ranges, deco: buildDecorations(state, ranges) };
    },
    update(prev, tr) {
      let newRanges = prev.ranges;
      let changed = false;

      // If document changed, recompute from scratch
      if (tr.docChanged) {
        newRanges = computeInitialRanges(tr.state, margin, minSize);
        changed = true;
      }

      for (const e of tr.effects) {
        if (e.is(expandUp) || e.is(expandDown) || e.is(expandAll)) {
          newRanges = applyExpandEffect(newRanges, tr.state, e);
          changed = true;
        }
      }

      if (!changed) return prev;

      return { ranges: newRanges, deco: buildDecorations(tr.state, newRanges) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });

  return [collapsedField];
}
