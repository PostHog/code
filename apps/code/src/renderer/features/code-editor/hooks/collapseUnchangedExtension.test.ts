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
    // After first chunk: startOur=20, startOther=25
    // pos=30 → 25 + (30 - 20) = 35
    expect(mapPosBetweenSides(30, chunks, true)).toBe(35);
  });

  it("maps position between chunks from side B", () => {
    // After first chunk: startOur=25, startOther=20
    // pos=35 → 20 + (35 - 25) = 30
    expect(mapPosBetweenSides(35, chunks, false)).toBe(30);
  });

  it("maps position after last chunk from side A", () => {
    // After second chunk: startOur=60, startOther=70
    // pos=80 → 70 + (80 - 60) = 90
    expect(mapPosBetweenSides(80, chunks, true)).toBe(90);
  });

  it("handles empty chunks array", () => {
    expect(mapPosBetweenSides(42, [], true)).toBe(42);
    expect(mapPosBetweenSides(42, [], false)).toBe(42);
  });

  it("maps position at exact chunk boundary", () => {
    // pos=10 equals fromA of first chunk → startOur=0, startOther=0
    // 10 >= 10, so returns 0 + (10 - 0) = 10
    expect(mapPosBetweenSides(10, chunks, true)).toBe(10);
  });
});

describe("applyExpandEffect", () => {
  // 20-line doc: each line is "line N\n", line 1 starts at pos 0
  const state = makeState(20);

  const ranges: CollapsedRange[] = [
    { fromLine: 1, toLine: 5 },
    { fromLine: 12, toLine: 18 },
  ];

  it("expandAll removes the targeted range", () => {
    // pos inside range 1 (fromLine=1 → pos=0, toLine=5)
    const pos = state.doc.line(3).from;
    const effect = expandAll.of(pos);
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([{ fromLine: 12, toLine: 18 }]);
  });

  it("expandAll leaves non-targeted ranges intact", () => {
    // pos outside both ranges
    const pos = state.doc.line(8).from;
    const effect = expandAll.of(pos);
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual(ranges);
  });

  it("expandUp reveals lines from the top of the range", () => {
    const pos = state.doc.line(14).from;
    const effect = expandUp.of({ pos, lines: 3 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([
      { fromLine: 1, toLine: 5 },
      { fromLine: 12, toLine: 15 },
    ]);
  });

  it("expandDown reveals lines from the bottom of the range", () => {
    const pos = state.doc.line(14).from;
    const effect = expandDown.of({ pos, lines: 3 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([
      { fromLine: 1, toLine: 5 },
      { fromLine: 15, toLine: 18 },
    ]);
  });

  it("expandUp removes range when lines exceed range size", () => {
    const pos = state.doc.line(3).from;
    const effect = expandUp.of({ pos, lines: 100 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([{ fromLine: 12, toLine: 18 }]);
  });

  it("expandDown removes range when lines exceed range size", () => {
    const pos = state.doc.line(3).from;
    const effect = expandDown.of({ pos, lines: 100 });
    const result = applyExpandEffect(ranges, state, effect);

    expect(result).toEqual([{ fromLine: 12, toLine: 18 }]);
  });
});

describe("buildDecorations", () => {
  it("skips ranges where fromLine > toLine", () => {
    const state = makeState(10);
    const ranges: CollapsedRange[] = [{ fromLine: 5, toLine: 3 }];
    const deco = buildDecorations(state, ranges);

    expect(deco.size).toBe(0);
  });

  it("creates decorations for valid ranges", () => {
    const state = makeState(20);
    const ranges: CollapsedRange[] = [
      { fromLine: 3, toLine: 7 },
      { fromLine: 15, toLine: 18 },
    ];
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
    const ranges: CollapsedRange[] = [{ fromLine: 5, toLine: 5 }];
    const deco = buildDecorations(state, ranges);

    expect(deco.size).toBe(1);
  });
});
