#!/usr/bin/env tsx
/**
 * Codemod: migrate static inline `style={{}}` properties to Tailwind classes.
 *
 * For every JsxAttribute named "style" with an ObjectLiteralExpression:
 *   1. For each PropertyAssignment whose value is a literal AND whose key is
 *      in MAPPING_TABLE, generate the Tailwind class string.
 *   2. Remove the converted property from the style object.
 *   3. Merge the new classes into the element's `className` (handle string,
 *      template literal, or other expression).
 *   4. If the style object is empty after removal, delete the entire `style`
 *      attribute.
 *
 * Conservative: skips spreads, conditionals, computed values, fontFamily/
 * fontSize/lineHeight (handled in earlier passes), and properties not in the
 * table. Skipped properties are logged with file+line for manual review.
 *
 * Usage:
 *   ./scripts/migrate-inline-styles.ts                   # apply
 *   ./scripts/migrate-inline-styles.ts --dry-run         # preview
 *   ./scripts/migrate-inline-styles.ts --files=<glob>    # narrow
 */

import * as path from "node:path";
import {
  type JsxAttribute,
  type JsxSelfClosingElement,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

// ---------- CLI args ----------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const filesArg = args
  .find((a) => a.startsWith("--files="))
  ?.slice("--files=".length);

// ---------- Mapping ----------

/**
 * Each handler receives the property's value-text AST representation and
 * either returns a Tailwind class string to merge into className (and
 * implicitly signals "remove this property"), or returns null to leave the
 * property alone.
 *
 * Value-text is the source text of the value (without quotes for string
 * literals). Numeric literals are passed as their toString().
 */
type Handler = (
  valueText: string,
  valueKind: "string" | "number",
) => string | null;

/** Match any var(--TOKEN) form. Covers Radix scales (gray-12, gray-a3),
 *  theme tokens (color-panel-solid, accent-contrast), etc. */
function cssVarToken(valueText: string): string | null {
  const match = valueText.match(/^var\(--([a-z][a-z\d-]*)\)$/);
  return match ? match[1] : null;
}

/** Match Radix space tokens "var(--space-N)" → Tailwind spacing key */
const RADIX_SPACE_TO_TW: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "6",
  "6": "8",
  "7": "10",
  "8": "12",
  "9": "16",
};
function radixSpaceVar(valueText: string): string | null {
  const match = valueText.match(/^var\(--space-(\d+)\)$/);
  if (!match) return null;
  return RADIX_SPACE_TO_TW[match[1]] ?? null;
}

/** Match Radix radius tokens "var(--radius-N)" — preserve as CSS-var class */
function radixRadiusVar(valueText: string): string | null {
  const match = valueText.match(/^var\(--radius-(\d+)\)$/);
  return match ? match[1] : null;
}

/** Numeric or px → Tailwind arbitrary spacing class fragment (e.g. "[10px]"). */
function numericPx(
  valueText: string,
  valueKind: "string" | "number",
): string | null {
  if (valueKind === "number") {
    if (valueText === "0") return "0";
    return `[${valueText}px]`;
  }
  const m = valueText.match(/^(\d+(?:\.\d+)?)px$/);
  if (m) {
    if (m[1] === "0") return "0";
    return `[${m[1]}px]`;
  }
  return null;
}

/** Numeric/px/percent/vw/vh → Tailwind arbitrary fragment (for sizing). */
function sizingValue(
  valueText: string,
  valueKind: "string" | "number",
): string | null {
  if (valueKind === "number") {
    if (valueText === "0") return "0";
    return `[${valueText}px]`;
  }
  const px = valueText.match(/^(\d+(?:\.\d+)?)px$/);
  if (px) return px[1] === "0" ? "0" : `[${px[1]}px]`;
  const pct = valueText.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return `[${pct[1]}%]`;
  const vw = valueText.match(/^(\d+(?:\.\d+)?)vw$/);
  if (vw) return `[${vw[1]}vw]`;
  const vh = valueText.match(/^(\d+(?:\.\d+)?)vh$/);
  if (vh) return `[${vh[1]}vh]`;
  return null;
}

/** Build a margin/padding handler for a given prefix (m, mt, mb, …). */
function makeSpacingHandler(prefix: string): Handler {
  return (valueText, valueKind) => {
    const radix = radixSpaceVar(valueText);
    if (radix !== null) return `${prefix}-${radix}`;
    const px = numericPx(valueText, valueKind);
    if (px !== null) return `${prefix}-${px}`;
    if (valueText === "auto") return `${prefix}-auto`;
    return null;
  };
}

/** Multi-value padding/margin shorthand: "0 6px" / "6px 10px" / "0 14px" / etc.
 *  Returns a class string like "px-[10px] py-[6px]" or null if not parseable.
 *  Only handles the common 2-value form (vertical horizontal). */
function multiValueSpacing(
  prefix: "p" | "m",
  valueText: string,
): string | null {
  const parts = valueText.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const v = parsePart(parts[0]);
  const h = parsePart(parts[1]);
  if (v === null || h === null) return null;
  return `${prefix}x-${h} ${prefix}y-${v}`;
}

function parsePart(part: string): string | null {
  if (part === "0") return "0";
  const px = part.match(/^(\d+(?:\.\d+)?)px$/);
  if (px) return px[1] === "0" ? "0" : `[${px[1]}px]`;
  const space = part.match(/^var\(--space-(\d+)\)$/);
  if (space) return RADIX_SPACE_TO_TW[space[1]] ?? null;
  return null;
}

/** Build a "color" / "background-color" handler for a given prefix (text, bg, border). */
function makeColorHandler(prefix: string): Handler {
  return (valueText) => {
    const token = cssVarToken(valueText);
    if (!token) return null;
    return `${prefix}-(--${token})`;
  };
}

const MAPPING_TABLE: Record<string, Handler> = {
  // Color / background
  color: (v) => {
    if (v === "inherit") return null; // intentional inherit, leave as inline
    if (v === "transparent") return "text-transparent";
    return makeColorHandler("text")(v, "string");
  },
  backgroundColor: (v) => {
    if (v === "transparent") return "bg-transparent";
    return makeColorHandler("bg")(v, "string");
  },
  background: (v) => {
    if (v === "none" || v === "transparent") return "bg-transparent";
    const token = cssVarToken(v);
    return token ? `bg-(--${token})` : null;
  },

  // Border (only the simple "1px solid var(--TOKEN)" form, or "none")
  border: (v) => {
    if (v === "none") return "border-0";
    const m = v.match(/^1px solid var\(--([a-z][a-z\d-]*)\)$/);
    return m ? `border border-(--${m[1]})` : null;
  },
  borderTop: (v) => {
    const m = v.match(/^1px solid var\(--([a-z][a-z\d-]*)\)$/);
    return m ? `border-t border-t-(--${m[1]})` : null;
  },
  borderBottom: (v) => {
    const m = v.match(/^1px solid var\(--([a-z][a-z\d-]*)\)$/);
    return m ? `border-b border-b-(--${m[1]})` : null;
  },
  borderLeft: (v) => {
    const m = v.match(/^1px solid var\(--([a-z][a-z\d-]*)\)$/);
    return m ? `border-l border-l-(--${m[1]})` : null;
  },
  borderRight: (v) => {
    const m = v.match(/^1px solid var\(--([a-z][a-z\d-]*)\)$/);
    return m ? `border-r border-r-(--${m[1]})` : null;
  },
  borderRadius: (v, kind) => {
    const radix = radixRadiusVar(v);
    if (radix !== null) return `rounded-(--radius-${radix})`;
    const px = numericPx(v, kind);
    if (px !== null) return `rounded-${px}`;
    return null;
  },

  // Spacing — handle single-value first via the standard handler, then
  // multi-value shorthand for padding/margin via the dedicated parser.
  margin: (v, k) => makeSpacingHandler("m")(v, k) ?? multiValueSpacing("m", v),
  marginTop: makeSpacingHandler("mt"),
  marginRight: makeSpacingHandler("mr"),
  marginBottom: makeSpacingHandler("mb"),
  marginLeft: makeSpacingHandler("ml"),
  padding: (v, k) => makeSpacingHandler("p")(v, k) ?? multiValueSpacing("p", v),
  paddingTop: makeSpacingHandler("pt"),
  paddingRight: makeSpacingHandler("pr"),
  paddingBottom: makeSpacingHandler("pb"),
  paddingLeft: makeSpacingHandler("pl"),
  gap: makeSpacingHandler("gap"),
  rowGap: makeSpacingHandler("gap-y"),
  columnGap: makeSpacingHandler("gap-x"),

  // Position offsets
  top: makeSpacingHandler("top"),
  right: makeSpacingHandler("right"),
  bottom: makeSpacingHandler("bottom"),
  left: makeSpacingHandler("left"),
  inset: makeSpacingHandler("inset"),

  // Sizing — accepts numeric/px, percent, vw/vh, plus named keywords
  width: (v, kind) => {
    if (v === "100%") return "w-full";
    if (v === "auto") return "w-auto";
    if (v === "fit-content") return "w-fit";
    if (v === "100vw") return "w-screen";
    const x = sizingValue(v, kind);
    return x !== null ? `w-${x}` : null;
  },
  height: (v, kind) => {
    if (v === "100%") return "h-full";
    if (v === "auto") return "h-auto";
    if (v === "fit-content") return "h-fit";
    if (v === "100vh") return "h-screen";
    const x = sizingValue(v, kind);
    return x !== null ? `h-${x}` : null;
  },
  minWidth: (v, kind) => {
    if (v === "0") return "min-w-0";
    if (kind === "number" && v === "0") return "min-w-0";
    const x = sizingValue(v, kind);
    return x !== null ? `min-w-${x}` : null;
  },
  minHeight: (v, kind) => {
    if (v === "0") return "min-h-0";
    if (kind === "number" && v === "0") return "min-h-0";
    const x = sizingValue(v, kind);
    return x !== null ? `min-h-${x}` : null;
  },
  maxWidth: (v, kind) => {
    const x = sizingValue(v, kind);
    return x !== null ? `max-w-${x}` : null;
  },
  maxHeight: (v, kind) => {
    const x = sizingValue(v, kind);
    return x !== null ? `max-h-${x}` : null;
  },

  // Flex
  flex: (v, kind) => {
    if ((kind === "number" && v === "1") || v === "1 1 0%" || v === "1 1 0px")
      return "flex-1";
    if (v === "0 1 auto") return "flex-initial";
    if (v === "none") return "flex-none";
    if (v === "auto" || v === "1 1 auto") return "flex-auto";
    return null;
  },
  flexShrink: (v) => {
    if (v === "0") return "shrink-0";
    if (v === "1") return "shrink";
    return null;
  },
  flexGrow: (v) => {
    if (v === "0") return "grow-0";
    if (v === "1") return "grow";
    return null;
  },
  flexDirection: (v) => {
    if (v === "row") return "flex-row";
    if (v === "column") return "flex-col";
    if (v === "row-reverse") return "flex-row-reverse";
    if (v === "column-reverse") return "flex-col-reverse";
    return null;
  },
  alignItems: (v) => {
    if (v === "center") return "items-center";
    if (v === "flex-start") return "items-start";
    if (v === "flex-end") return "items-end";
    if (v === "stretch") return "items-stretch";
    if (v === "baseline") return "items-baseline";
    return null;
  },
  alignSelf: (v) => {
    if (v === "center") return "self-center";
    if (v === "flex-start") return "self-start";
    if (v === "flex-end") return "self-end";
    if (v === "stretch") return "self-stretch";
    if (v === "auto") return "self-auto";
    return null;
  },
  justifyContent: (v) => {
    if (v === "center") return "justify-center";
    if (v === "flex-start") return "justify-start";
    if (v === "flex-end") return "justify-end";
    if (v === "space-between") return "justify-between";
    if (v === "space-around") return "justify-around";
    if (v === "space-evenly") return "justify-evenly";
    return null;
  },

  // Display
  display: (v) => {
    if (v === "flex") return "flex";
    if (v === "inline-flex") return "inline-flex";
    if (v === "block") return "block";
    if (v === "inline-block") return "inline-block";
    if (v === "inline") return "inline";
    if (v === "grid") return "grid";
    if (v === "none") return "hidden";
    return null;
  },

  // Overflow
  overflow: (v) => {
    if (v === "hidden") return "overflow-hidden";
    if (v === "auto") return "overflow-auto";
    if (v === "visible") return "overflow-visible";
    if (v === "scroll") return "overflow-scroll";
    return null;
  },
  overflowX: (v) => {
    if (v === "hidden") return "overflow-x-hidden";
    if (v === "auto") return "overflow-x-auto";
    if (v === "visible") return "overflow-x-visible";
    if (v === "scroll") return "overflow-x-scroll";
    return null;
  },
  overflowY: (v) => {
    if (v === "hidden") return "overflow-y-hidden";
    if (v === "auto") return "overflow-y-auto";
    if (v === "visible") return "overflow-y-visible";
    if (v === "scroll") return "overflow-y-scroll";
    return null;
  },

  // Position
  position: (v) => {
    if (v === "absolute") return "absolute";
    if (v === "relative") return "relative";
    if (v === "fixed") return "fixed";
    if (v === "sticky") return "sticky";
    if (v === "static") return "static";
    return null;
  },

  // Cursor
  cursor: (v) => {
    if (v === "pointer") return "cursor-pointer";
    if (v === "default") return "cursor-default";
    if (v === "help") return "cursor-help";
    if (v === "not-allowed") return "cursor-not-allowed";
    if (v === "wait") return "cursor-wait";
    if (v === "grab") return "cursor-grab";
    if (v === "grabbing") return "cursor-grabbing";
    if (v === "text") return "cursor-text";
    if (v === "ew-resize") return "cursor-ew-resize";
    if (v === "ns-resize") return "cursor-ns-resize";
    if (v === "col-resize") return "cursor-col-resize";
    if (v === "row-resize") return "cursor-row-resize";
    if (v === "move") return "cursor-move";
    return null;
  },

  // Object fit
  objectFit: (v) => {
    if (v === "contain") return "object-contain";
    if (v === "cover") return "object-cover";
    if (v === "fill") return "object-fill";
    if (v === "none") return "object-none";
    if (v === "scale-down") return "object-scale-down";
    return null;
  },

  // Z-index — only common literals to avoid clobbering arbitrary stacking contexts
  zIndex: (v, kind) => {
    if (kind !== "number" && !/^\d+$/.test(v)) return null;
    const n = Number(v);
    if (n === 0 || n === 10 || n === 20 || n === 30 || n === 40 || n === 50) {
      return `z-${n}`;
    }
    return null;
  },

  // Text
  textAlign: (v) => {
    if (v === "left") return "text-left";
    if (v === "center") return "text-center";
    if (v === "right") return "text-right";
    if (v === "justify") return "text-justify";
    return null;
  },
  textTransform: (v) => {
    if (v === "uppercase") return "uppercase";
    if (v === "lowercase") return "lowercase";
    if (v === "capitalize") return "capitalize";
    if (v === "none") return "normal-case";
    return null;
  },
  textDecoration: (v) => {
    if (v === "underline") return "underline";
    if (v === "line-through") return "line-through";
    if (v === "none") return "no-underline";
    return null;
  },
  whiteSpace: (v) => {
    if (v === "nowrap") return "whitespace-nowrap";
    if (v === "pre") return "whitespace-pre";
    if (v === "pre-wrap") return "whitespace-pre-wrap";
    if (v === "pre-line") return "whitespace-pre-line";
    if (v === "normal") return "whitespace-normal";
    return null;
  },
  wordBreak: (v) => {
    if (v === "break-word") return "break-words";
    if (v === "break-all") return "break-all";
    if (v === "normal") return "break-normal";
    return null;
  },
  fontWeight: (v, kind) => {
    if (kind === "number" || /^\d+$/.test(v)) {
      if (v === "300") return "font-light";
      if (v === "400") return "font-normal";
      if (v === "500") return "font-medium";
      if (v === "600") return "font-semibold";
      if (v === "700") return "font-bold";
    }
    return null;
  },

  // Visual
  opacity: (v, kind) => {
    if (kind === "number" || /^\d+(?:\.\d+)?$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 1) {
        return `opacity-${Math.round(n * 100)}`;
      }
    }
    return null;
  },
  userSelect: (v) => {
    if (v === "none") return "select-none";
    if (v === "text") return "select-text";
    if (v === "all") return "select-all";
    if (v === "auto") return "select-auto";
    return null;
  },
  pointerEvents: (v) => {
    if (v === "none") return "pointer-events-none";
    if (v === "auto") return "pointer-events-auto";
    return null;
  },
  visibility: (v) => {
    if (v === "hidden") return "invisible";
    if (v === "visible") return "visible";
    return null;
  },

  // Box
  boxSizing: (v) => {
    if (v === "border-box") return "box-border";
    if (v === "content-box") return "box-content";
    return null;
  },

  // Lists
  listStyleType: (v) => {
    if (v === "disc") return "list-disc";
    if (v === "decimal") return "list-decimal";
    if (v === "none") return "list-none";
    return null;
  },
  listStylePosition: (v) => {
    if (v === "outside") return "list-outside";
    if (v === "inside") return "list-inside";
    return null;
  },
};

// ---------- Project setup ----------

const repoRoot = path.resolve(__dirname, "..");
const project = new Project({
  tsConfigFilePath: path.join(repoRoot, "tsconfig.json"),
  skipAddingFilesFromTsConfig: false,
});

const renderRoot = path.join(repoRoot, "src", "renderer");

// Files that ship CodeMirror / xterm theme objects — explicitly skip.
const SKIP_FILES = new Set([
  path.join(renderRoot, "features/code-editor/theme/editorTheme.ts"),
  path.join(
    renderRoot,
    "features/sessions/components/session-update/useCodePreviewExtensions.ts",
  ),
  path.join(renderRoot, "features/terminal/services/TerminalManager.ts"),
]);

let candidateFiles = project
  .getSourceFiles()
  .filter((sf) => sf.getFilePath().startsWith(renderRoot))
  .filter((sf) => sf.getFilePath().endsWith(".tsx"))
  .filter((sf) => !SKIP_FILES.has(sf.getFilePath()));

if (filesArg) {
  const needles = filesArg.split(",");
  candidateFiles = candidateFiles.filter((sf) =>
    needles.some((n) => sf.getFilePath().includes(n)),
  );
}

// ---------- Per-file work ----------

interface SkipLog {
  file: string;
  line: number;
  reason: string;
  snippet: string;
}

const skipLog: SkipLog[] = [];
const touchedFiles = new Set<SourceFile>();
let totalEdits = 0;
let totalProps = 0;

for (const sf of candidateFiles) {
  // Snapshot all style attributes upfront — we mutate as we go.
  const styleAttrs: JsxAttribute[] = [];
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() === "style") {
      styleAttrs.push(attr);
    }
  }

  for (const attr of styleAttrs) {
    const init = attr.getInitializer();
    if (!init || init.getKind() !== SyntaxKind.JsxExpression) continue;
    const expr = (init as { getExpression: () => unknown }).getExpression();
    if (!expr) continue;
    const exprNode = expr as { getKind: () => SyntaxKind };
    if (exprNode.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      // style={someVar}, style={cond ? a : b}, etc.
      skipLog.push(
        skipReason(
          sf,
          attr,
          "non-object-literal style (variable or expression)",
        ),
      );
      continue;
    }

    const obj = exprNode as ObjectLiteralExpression;
    const newClasses: string[] = [];
    const propsToRemove: PropertyAssignment[] = [];

    for (const prop of obj.getProperties()) {
      // Spreads, shorthands, computed keys → leave the entire style alone.
      if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
        if (prop.getKind() === SyntaxKind.SpreadAssignment) {
          // Keep going — try to convert sibling properties around the spread.
          continue;
        }
        skipLog.push(
          skipReason(
            sf,
            prop as never,
            `unsupported property kind: ${prop.getKindName()}`,
          ),
        );
        continue;
      }

      const assign = prop as PropertyAssignment;
      const nameNode = assign.getNameNode();
      const propName = nameNode.getText().replace(/^["']|["']$/g, "");
      totalProps++;

      const handler = MAPPING_TABLE[propName];
      if (!handler) {
        // Property not in mapping table — leave it.
        if (verbose) {
          skipLog.push(skipReason(sf, assign, `no mapping for ${propName}`));
        }
        continue;
      }

      const valueInit = assign.getInitializer();
      if (!valueInit) continue;

      // Read literal value text + kind.
      const { valueText, valueKind, isLiteral } = readLiteralValue(valueInit);
      if (!isLiteral) {
        skipLog.push(
          skipReason(sf, assign, `non-literal value for ${propName}`),
        );
        continue;
      }

      const cls = handler(valueText, valueKind);
      if (cls === null) {
        skipLog.push(
          skipReason(
            sf,
            assign,
            `unmappable ${propName}: ${valueText.slice(0, 40)}`,
          ),
        );
        continue;
      }

      newClasses.push(cls);
      propsToRemove.push(assign);
    }

    if (newClasses.length === 0) continue;

    // JsxAttribute is wrapped in a JsxAttributes node; its parent is the
    // JsxOpeningElement (for <tag>...</tag>) or JsxSelfClosingElement
    // (for <tag />). Both expose the attribute API we need.
    const attrs = attr.getParent();
    if (!attrs) continue;
    const opening = attrs.getParent() as JsxSelfClosingElement;
    if (!opening) continue;

    // Try to merge into className.
    const merged = mergeClassName(opening, newClasses);
    if (!merged) {
      skipLog.push(
        skipReason(
          sf,
          attr,
          `unsupported className shape, leaving style untouched`,
        ),
      );
      continue;
    }

    // Apply: remove the converted properties from the style object.
    for (const p of propsToRemove) {
      p.remove();
    }
    totalEdits += propsToRemove.length;

    // If style is now empty (no remaining properties or spreads), delete it.
    const remaining = obj.getProperties();
    if (remaining.length === 0) {
      attr.remove();
    }

    touchedFiles.add(sf);
  }
}

// ---------- Output ----------

if (dryRun) {
  console.log(
    `[dry-run] would edit ${touchedFiles.size} files, ${totalEdits} properties (out of ${totalProps} examined)`,
  );
} else {
  for (const sf of touchedFiles) sf.saveSync();
  console.log(
    `Edited ${touchedFiles.size} files, ${totalEdits} properties (out of ${totalProps} examined)`,
  );
  if (touchedFiles.size > 0) {
    console.log("\nNext step — run biome to sort the merged Tailwind classes:");
    const rels = [...touchedFiles]
      .map((sf) => path.relative(path.join(repoRoot, ".."), sf.getFilePath()))
      .join(" \\\n  ");
    console.log(`\n  npx biome check --write --unsafe \\\n  ${rels}\n`);
  }
}

if (verbose && skipLog.length > 0) {
  console.log(`\nSkip log (${skipLog.length} entries):\n`);
  // Group by reason for at-a-glance summary.
  const byReason = new Map<string, number>();
  for (const s of skipLog) {
    const key = s.reason.split(":")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  for (const [reason, count] of [...byReason.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)}  ${reason}`);
  }

  // Per-reason sample examples for "unmappable" buckets.
  const unmappableSamples = new Map<string, SkipLog[]>();
  for (const s of skipLog) {
    if (!s.reason.startsWith("unmappable")) continue;
    const list = unmappableSamples.get(s.reason) ?? [];
    if (list.length < 3) list.push(s);
    unmappableSamples.set(s.reason, list);
  }
  if (unmappableSamples.size > 0) {
    console.log(`\nSample unmappable values:\n`);
    for (const [reason, samples] of unmappableSamples) {
      console.log(`  ${reason}:`);
      for (const s of samples) {
        console.log(
          `    ${path.relative(repoRoot, s.file)}:${s.line}  ${s.snippet}`,
        );
      }
    }
  }
}

// ---------- Helpers ----------

function readLiteralValue(node: {
  getKind: () => SyntaxKind;
  getText: () => string;
}): {
  valueText: string;
  valueKind: "string" | "number";
  isLiteral: boolean;
} {
  const kind = node.getKind();
  if (kind === SyntaxKind.StringLiteral) {
    return {
      valueText: (node as { getLiteralValue: () => string }).getLiteralValue(),
      valueKind: "string",
      isLiteral: true,
    };
  }
  if (kind === SyntaxKind.NumericLiteral) {
    return {
      valueText: node.getText(),
      valueKind: "number",
      isLiteral: true,
    };
  }
  if (kind === SyntaxKind.JsxExpression) {
    const inner = (node as { getExpression: () => unknown }).getExpression();
    if (!inner) return { valueText: "", valueKind: "string", isLiteral: false };
    return readLiteralValue(inner as never);
  }
  if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return {
      valueText: (node as { getLiteralValue: () => string }).getLiteralValue(),
      valueKind: "string",
      isLiteral: true,
    };
  }
  if (kind === SyntaxKind.PrefixUnaryExpression) {
    // -1, etc.
    return {
      valueText: node.getText(),
      valueKind: "number",
      isLiteral: false, // be conservative
    };
  }
  return { valueText: "", valueKind: "string", isLiteral: false };
}

function findAttr(
  opening: { getAttributes: () => unknown[] },
  name: string,
): JsxAttribute | undefined {
  for (const a of opening.getAttributes() as unknown[]) {
    const attr = a as {
      getKind: () => SyntaxKind;
      getNameNode?: () => { getText: () => string };
    };
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    if (attr.getNameNode?.().getText() === name) return attr as JsxAttribute;
  }
  return undefined;
}

function mergeClassName(
  opening: {
    getAttributes: () => unknown[];
    addAttribute: (decl: { name: string; initializer: string }) => void;
  },
  newClasses: string[],
): boolean {
  if (newClasses.length === 0) return true;
  const newPrefix = newClasses.join(" ");

  const existing = findAttr(opening, "className");
  if (!existing) {
    opening.addAttribute({ name: "className", initializer: `"${newPrefix}"` });
    return true;
  }

  const init = existing.getInitializer();
  if (!init) {
    existing.setInitializer(`"${newPrefix}"`);
    return true;
  }

  if (init.getKind() === SyntaxKind.StringLiteral) {
    const current = (
      init as { getLiteralValue: () => string }
    ).getLiteralValue();
    existing.setInitializer(`"${newPrefix} ${current}"`);
    return true;
  }

  if (init.getKind() === SyntaxKind.JsxExpression) {
    const expr = (init as { getExpression: () => unknown }).getExpression();
    if (!expr) {
      existing.setInitializer(`"${newPrefix}"`);
      return true;
    }
    const exprNode = expr as {
      getKind: () => SyntaxKind;
      getText: () => string;
      getLiteralValue?: () => string;
    };

    if (
      exprNode.getKind() === SyntaxKind.StringLiteral ||
      exprNode.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      const current = exprNode.getLiteralValue?.();
      existing.setInitializer(`"${newPrefix} ${current}"`);
      return true;
    }

    if (exprNode.getKind() === SyntaxKind.TemplateExpression) {
      const tplExpr = expr as {
        getHead: () => {
          getText: () => string;
          replaceWithText: (t: string) => void;
        };
      };
      const head = tplExpr.getHead();
      const headText = head.getText(); // `…${
      const inner = headText.slice(1, -2);
      head.replaceWithText(`\`${newPrefix} ${inner}\${`);
      return true;
    }

    // Identifier, call expression, conditional, etc. — wrap.
    const exprText = exprNode.getText();
    existing.setInitializer(`{\`${newPrefix} \${${exprText}}\`}`);
    return true;
  }

  return false;
}

function skipReason(
  sf: SourceFile,
  node: { getStartLineNumber: () => number; getText: () => string },
  reason: string,
): SkipLog {
  return {
    file: sf.getFilePath(),
    line: node.getStartLineNumber(),
    reason,
    snippet: node.getText().split("\n")[0].trim().slice(0, 120),
  };
}
