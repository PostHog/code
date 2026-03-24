import type { CSSProperties } from "react";

export const ROOT_CHILD_PADDING = 20;
const TREE_INDENT = 12;

export function getTreePadding(depth: number): number {
  return ROOT_CHILD_PADDING + depth * TREE_INDENT;
}

export function getRowPaddingStyle(paddingLeft: number): CSSProperties {
  return {
    "--changes-row-padding": `${paddingLeft}px`,
  } as CSSProperties;
}
