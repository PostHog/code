import { describe, expect, it } from "vitest";
import {
  type ResolveDiffSourceInput,
  type ResolvedDiffSource,
  resolveDiffSource,
} from "./resolveDiffSource";

describe("resolveDiffSource", () => {
  it.each<
    ResolveDiffSourceInput & { expected: ResolvedDiffSource; desc: string }
  >([
    {
      desc: "heuristic: uncommitted changes → local",
      configured: null,
      hasLocalChanges: true,
      linkedBranch: "feat/x",
      aheadOfDefault: 3,
      expected: "local",
    },
    {
      desc: "heuristic: clean tree with commits ahead → branch",
      configured: null,
      hasLocalChanges: false,
      linkedBranch: "feat/x",
      aheadOfDefault: 2,
      expected: "branch",
    },
    {
      desc: "heuristic: no linked branch → local",
      configured: null,
      hasLocalChanges: false,
      linkedBranch: null,
      aheadOfDefault: 0,
      expected: "local",
    },
    {
      desc: "heuristic: linked branch but no commits ahead → local",
      configured: null,
      hasLocalChanges: false,
      linkedBranch: "feat/x",
      aheadOfDefault: 0,
      expected: "local",
    },
    {
      desc: "explicit local respected even when branch is available",
      configured: "local",
      hasLocalChanges: false,
      linkedBranch: "feat/x",
      aheadOfDefault: 5,
      expected: "local",
    },
    {
      desc: "explicit branch respected when available",
      configured: "branch",
      hasLocalChanges: true,
      linkedBranch: "feat/x",
      aheadOfDefault: 1,
      expected: "branch",
    },
    {
      desc: "explicit branch falls back to local when no linked branch",
      configured: "branch",
      hasLocalChanges: false,
      linkedBranch: null,
      aheadOfDefault: 0,
      expected: "local",
    },
    {
      desc: "explicit branch falls back to local when no commits ahead",
      configured: "branch",
      hasLocalChanges: false,
      linkedBranch: "feat/x",
      aheadOfDefault: 0,
      expected: "local",
    },
  ])("$desc", ({ expected, ...input }) => {
    expect(resolveDiffSource(input)).toBe(expected);
  });
});
