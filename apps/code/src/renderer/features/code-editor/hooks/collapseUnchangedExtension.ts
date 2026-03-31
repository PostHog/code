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
  GutterMarker,
  gutterWidgetClass,
  WidgetType,
} from "@codemirror/view";

const EXPAND_LINES = 20;

export interface CollapsedRange {
  fromLine: number;
  toLine: number;
  limitFromLine: number;
  limitToLine: number;
}

export const expandUp = StateEffect.define<{ pos: number; lines: number }>();
export const expandDown = StateEffect.define<{ pos: number; lines: number }>();
export const expandAll = StateEffect.define<number>();

const SVG_ARROW_LINE_DOWN = `<svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M50.34,117.66a8,8,0,0,1,11.32-11.32L120,164.69V32a8,8,0,0,1,16,0V164.69l58.34-58.35a8,8,0,0,1,11.32,11.32l-72,72a8,8,0,0,1-11.32,0ZM216,208H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/></svg>`;
const SVG_ARROW_LINE_UP = `<svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,138.34a8,8,0,0,1-11.32,11.32L136,91.31V224a8,8,0,0,1-16,0V91.31L61.66,149.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0ZM216,32H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/></svg>`;
const SVG_ARROWS_OUT_LINE_VERTICAL = `<svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM101.66,53.66,120,35.31V96a8,8,0,0,0,16,0V35.31l18.34,18.35a8,8,0,0,0,11.32-11.32l-32-32a8,8,0,0,0-11.32,0l-32,32a8,8,0,0,0,11.32,11.32Zm52.68,148.68L136,220.69V160a8,8,0,0,0-16,0v60.69l-18.34-18.35a8,8,0,0,0-11.32,11.32l32,32a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Z"/></svg>`;

class CollapsedGutterMarker extends GutterMarker {
  elementClass = "cm-collapsed-gutter-el";
}

const collapsedGutterMarker = new CollapsedGutterMarker();

class ExpandWidget extends WidgetType {
  constructor(
    readonly collapsedLines: number,
    readonly showUp: boolean,
    readonly showDown: boolean,
    readonly expandableUp: number,
    readonly expandableDown: number,
  ) {
    super();
  }

  eq(other: ExpandWidget) {
    return (
      this.collapsedLines === other.collapsedLines &&
      this.showUp === other.showUp &&
      this.showDown === other.showDown &&
      this.expandableUp === other.expandableUp &&
      this.expandableDown === other.expandableDown
    );
  }

  toDOM(view: EditorView) {
    const outer = document.createElement("div");
    outer.className = "cm-collapsed-context";

    if (this.showUp) {
      const upBtn = document.createElement("button");
      upBtn.className = "cm-collapsed-expand-btn";
      const upLines = Math.min(EXPAND_LINES, this.collapsedLines);
      upBtn.title = `Expand ${upLines} lines`;
      upBtn.innerHTML = `${SVG_ARROW_LINE_DOWN}<span>${upLines} lines</span>`;
      upBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(outer);
        view.dispatch({ effects: expandUp.of({ pos, lines: EXPAND_LINES }) });
        syncSibling(view, expandUp, pos, EXPAND_LINES);
      });
      outer.appendChild(upBtn);
    }

    const label = document.createElement("button");
    label.className = "cm-collapsed-expand-btn";
    label.title = `Expand all ${this.collapsedLines} lines`;
    label.innerHTML = `${SVG_ARROWS_OUT_LINE_VERTICAL}<span>All ${this.collapsedLines} lines</span>`;
    label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(outer);
      view.dispatch({ effects: expandAll.of(pos) });
      syncSibling(view, expandAll, pos);
    });
    outer.appendChild(label);

    if (this.showDown) {
      const downBtn = document.createElement("button");
      downBtn.className = "cm-collapsed-expand-btn";
      const downLines = Math.min(EXPAND_LINES, this.collapsedLines);
      downBtn.title = `Expand ${downLines} lines`;
      downBtn.innerHTML = `${SVG_ARROW_LINE_UP}<span>${downLines} lines</span>`;
      downBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(outer);
        view.dispatch({ effects: expandDown.of({ pos, lines: EXPAND_LINES }) });
        syncSibling(view, expandDown, pos, EXPAND_LINES);
      });
      outer.appendChild(downBtn);
    }

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
    const expandableUp = range.fromLine - range.limitFromLine;
    const expandableDown = range.limitToLine - range.toLine;
    const canExpandUp = expandableUp > 0 && lines >= EXPAND_LINES;
    const canExpandDown = expandableDown > 0 && lines >= EXPAND_LINES;
    builder.add(
      from,
      to,
      Decoration.replace({
        widget: new ExpandWidget(
          lines,
          canExpandUp,
          canExpandDown,
          expandableUp,
          expandableDown,
        ),
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
    const limitFrom = i ? prevLine : 1;
    const limitTo = chunk
      ? state.doc.lineAt(isA ? chunk.fromA : chunk.fromB).number - 1
      : state.doc.lines;
    const collapseFrom = i ? prevLine + margin : 1;
    const collapseTo = chunk ? limitTo - margin : state.doc.lines;
    const lines = collapseTo - collapseFrom + 1;

    if (lines >= minSize) {
      ranges.push({
        fromLine: collapseFrom,
        toLine: collapseTo,
        limitFromLine: limitFrom,
        limitToLine: limitTo,
      });
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

    if (isUp) {
      const newFrom = range.fromLine + lines;
      if (newFrom > range.toLine) return [];
      return [{ ...range, fromLine: newFrom }];
    }

    if (isDown) {
      const newTo = range.toLine - lines;
      if (newTo < range.fromLine) return [];
      return [{ ...range, toLine: newTo }];
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

      if (tr.docChanged || (prev.ranges.length === 0 && getChunks(tr.state))) {
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

  const collapsedGutterFill = gutterWidgetClass.of((_view, widget) => {
    if (widget instanceof ExpandWidget) return collapsedGutterMarker;
    return null;
  });

  return [collapsedField, collapsedGutterFill];
}
