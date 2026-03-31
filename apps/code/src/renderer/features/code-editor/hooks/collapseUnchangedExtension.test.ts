import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  applyExpandEffect,
  buildDecorations,
  type CollapsedRange,
  expandAll,
  expandDown,
  expandUp,
  mapPosBetweenSides,
} from "./collapseUnchangedExtension";

function makeState(lineCount: number): EditorState {
  const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
  return EditorState.create({ doc: lines.join("\n") });
}

function range(
  from: number,
  to: number,
  limitFrom?: number,
  limitTo?: number,
): CollapsedRange {
  return {
    fromLine: from,
    toLine: to,
    limitFromLine: limitFrom ?? from,
    limitToLine: limitTo ?? to,
  };
}

describe("mapPosBetweenSides", () => {
  const chunks = [
    { fromA: 10, toA: 20, fromB: 10, toB: 25 },
    { fromA: 50, toA: 60, fromB: 55, toB: 70 },
  ];

  it("maps position before first chunk", () => {
    expect(mapPosBetweenSides(5, chunks, true)).toBe(5);
    expect(mapPosBetweenSides(5, chunks, false)).toBe(5);
  });

  it("maps position between chunks from side A", () => {
    expect(mapPosBetweenSides(30, chunks, true)).toBe(35);
  });

  it("maps position between chunks from side B", () => {
    expect(mapPosBetweenSides(35, chunks, false)).toBe(30);
  });

  it("maps position after last chunk from side A", () => {
    expect(mapPosBetweenSides(80, chunks, true)).toBe(90);
  });

  it("handles empty chunks array", () => {
    expect(mapPosBetweenSides(42, [], true)).toBe(42);
    expect(mapPosBetweenSides(42, [], false)).toBe(42);
  });

  it("maps position at exact chunk boundary", () => {
    expect(mapPosBetweenSides(10, chunks, true)).toBe(10);
  });
});

describe("applyExpandEffect", () => {
  const state = makeState(20);

  const ranges: CollapsedRange[] = [range(1, 5), range(12, 18)];

  it("expandAll removes the targeted range", () => {
    const pos = state.doc.line(3).from;
    const effect = expandAll.of(pos);
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([range(12, 18)]);
  });

  it("expandAll leaves non-targeted ranges intact", () => {
    const pos = state.doc.line(8).from;
    const effect = expandAll.of(pos);
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual(ranges);
  });

  it("expandUp reveals lines above the collapsed range", () => {
    const pos = state.doc.line(14).from;
    const effect = expandUp.of({ pos, lines: 3 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([range(1, 5), range(15, 18, 12, 18)]);
  });

  it("expandDown reveals lines below the collapsed range", () => {
    const pos = state.doc.line(14).from;
    const effect = expandDown.of({ pos, lines: 3 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([range(1, 5), range(12, 15, 12, 18)]);
  });

  it("expandUp removes range when lines exceed range size", () => {
    const pos = state.doc.line(3).from;
    const effect = expandUp.of({ pos, lines: 100 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([range(12, 18)]);
  });

  it("expandDown removes range when lines exceed range size", () => {
    const pos = state.doc.line(3).from;
    const effect = expandDown.of({ pos, lines: 100 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([range(12, 18)]);
  });

  it("preserves original boundaries through multiple expansions", () => {
    const pos = state.doc.line(14).from;
    const first = applyExpandEffect(
      ranges,
      state,
      expandUp.of({ pos, lines: 2 }),
    );
    const second = applyExpandEffect(
      first,
      state,
      expandDown.of({ pos: state.doc.line(16).from, lines: 2 }),
    );

    expect(second).toEqual([range(1, 5), range(14, 16, 12, 18)]);
  });
});

describe("buildDecorations", () => {
  it("skips ranges where fromLine > toLine", () => {
    const state = makeState(10);
    const ranges: CollapsedRange[] = [range(5, 3)];
    const deco = buildDecorations(state, ranges);

    expect(deco.size).toBe(0);
  });

  it("creates decorations for valid ranges", () => {
    const state = makeState(20);
    const ranges: CollapsedRange[] = [range(3, 7), range(15, 18)];
    const deco = buildDecorations(state, ranges);

    expect(deco.size).toBe(2);
  });

  it("handles empty ranges array", () => {
    const state = makeState(10);
    const deco = buildDecorations(state, []);

    expect(deco.size).toBe(0);
  });

  it("creates single-line range decoration", () => {
    const state = makeState(10);
    const ranges: CollapsedRange[] = [range(5, 5)];
    const deco = buildDecorations(state, ranges);

    expect(deco.size).toBe(1);
  });
});
