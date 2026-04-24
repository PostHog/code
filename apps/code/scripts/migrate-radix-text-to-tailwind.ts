#!/usr/bin/env tsx
/**
 * One-shot codemod: migrate Radix Themes text-rendering components from
 * Radix's `size` / `weight` props to Tailwind utility classes.
 *
 * Targets (only when imported from "@radix-ui/themes"):
 *   <Text>, <Heading>, <Code>, <Link>, <Kbd>, <Em>, <Strong>, <Quote>,
 *   <Dialog.Title>, <Dialog.Description>,
 *   <AlertDialog.Title>, <AlertDialog.Description>
 *
 * For each matching JSX element it:
 *   1. Reads literal `size` / `weight` props (skips non-literal expressions
 *      and logs them).
 *   2. Removes the `size` / `weight` attributes.
 *   3. Merges the equivalent Tailwind classes into `className`:
 *        - StringLiteral className: prepend new classes inside the string
 *        - TemplateLiteral className: prepend new classes into first quasi
 *        - Any other expression: wrap in template literal
 *        - No className: add new className="..."
 *
 * After the run: invoke `biome check --write --unsafe <touched files>` to
 * sort the merged Tailwind classes (Biome's useSortedClasses rule).
 *
 * Usage:
 *   ./scripts/migrate-radix-text-to-tailwind.ts                   # apply
 *   ./scripts/migrate-radix-text-to-tailwind.ts --dry-run         # preview
 *   ./scripts/migrate-radix-text-to-tailwind.ts --files=<glob>    # narrow
 */

import * as path from "node:path";
import {
  type JsxAttribute,
  type JsxElement,
  type JsxSelfClosingElement,
  Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

// ---------- CLI args ----------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filesArg = args
  .find((a) => a.startsWith("--files="))
  ?.slice("--files=".length);

// ---------- Mapping tables ----------

/**
 * Radix `size` value → Tailwind class string.
 *
 * Notes:
 *   - size="1" is overridden in this codebase to 13px / 20px LH (not the
 *     Radix default 12/16). Mapped to text-[13px] leading-5.
 *   - size="2", "3", "5" match Tailwind defaults exactly.
 *   - size="4", "6" Tailwind defaults have looser line-heights, so we
 *     pin the Radix line-height explicitly.
 */
const SIZE_TO_TW: Record<string, string> = {
  "1": "text-[13px] leading-5",
  "2": "text-sm",
  "3": "text-base",
  "4": "text-lg leading-[26px]",
  "5": "text-xl",
  "6": "text-2xl leading-[30px]",
  // size 7-9 are Radix's hero scale and aren't used in this codebase, but
  // include for safety:
  "7": "text-[28px] leading-9",
  "8": "text-[35px] leading-10",
  "9": "text-6xl leading-none",
};

const WEIGHT_TO_TW: Record<string, string> = {
  light: "font-light",
  regular: "", // = Tailwind default font-normal, which we inherit
  medium: "font-medium",
  bold: "font-bold",
};

// JSX names this codemod will rewrite. Plain identifiers must be imported
// from "@radix-ui/themes" — qualified ones (e.g. Dialog.Title) require the
// root identifier (Dialog) to be imported from "@radix-ui/themes".
const RADIX_PLAIN_TARGETS = new Set([
  "Text",
  "Heading",
  "Code",
  "Link",
  "Kbd",
  "Em",
  "Strong",
  "Quote",
]);
const RADIX_QUALIFIED_ROOTS = new Set(["Dialog", "AlertDialog"]);
const RADIX_QUALIFIED_TARGETS = new Set(["Title", "Description"]);

// ---------- Project setup ----------

const repoRoot = path.resolve(__dirname, "..");
const project = new Project({
  tsConfigFilePath: path.join(repoRoot, "tsconfig.json"),
  skipAddingFilesFromTsConfig: false,
});

const renderRoot = path.join(repoRoot, "src", "renderer");
let candidateFiles = project
  .getSourceFiles()
  .filter((sf) => sf.getFilePath().startsWith(renderRoot))
  .filter((sf) => sf.getFilePath().endsWith(".tsx"));

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
const touchedFiles: SourceFile[] = [];
let totalEdits = 0;

for (const sf of candidateFiles) {
  const radixImports = collectRadixImports(sf);
  if (radixImports.size === 0) continue;

  let fileEdited = false;

  // Walk JSX. Snapshot first because we mutate.
  const elements: Array<JsxElement | JsxSelfClosingElement> = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  for (const el of elements) {
    const opening =
      el.getKind() === SyntaxKind.JsxElement
        ? (el as JsxElement).getOpeningElement()
        : (el as JsxSelfClosingElement);
    const tagName = opening.getTagNameNode().getText();

    if (!isTargetTag(tagName, radixImports)) continue;

    const sizeAttr = findAttr(opening, "size");
    const weightAttr = findAttr(opening, "weight");

    // Nothing to do if no size and no weight.
    if (!sizeAttr && !weightAttr) continue;

    const sizeValue = sizeAttr ? readStringLiteralValue(sizeAttr) : null;
    const weightValue = weightAttr ? readStringLiteralValue(weightAttr) : null;

    // Skip element if a non-literal size/weight is present (we can't safely
    // map runtime values to a Tailwind class string).
    if (sizeAttr && sizeValue === null) {
      skipLog.push(
        skipReason(sf, sizeAttr, `non-literal size on <${tagName}>`),
      );
      continue;
    }
    if (weightAttr && weightValue === null) {
      skipLog.push(
        skipReason(sf, weightAttr, `non-literal weight on <${tagName}>`),
      );
      continue;
    }

    const newClasses: string[] = [];
    if (sizeValue !== null) {
      const cls = SIZE_TO_TW[sizeValue];
      if (cls === undefined) {
        skipLog.push(
          skipReason(
            sf,
            sizeAttr!,
            `unknown size="${sizeValue}" on <${tagName}>`,
          ),
        );
        continue;
      }
      if (cls) newClasses.push(cls);
    }
    if (weightValue !== null) {
      const cls = WEIGHT_TO_TW[weightValue];
      if (cls === undefined) {
        skipLog.push(
          skipReason(
            sf,
            weightAttr!,
            `unknown weight="${weightValue}" on <${tagName}>`,
          ),
        );
        continue;
      }
      if (cls) newClasses.push(cls);
    }

    // Try to merge into className. If we can't safely merge, skip.
    const merged = mergeClassName(opening, newClasses);
    if (!merged) {
      skipLog.push(
        skipReason(
          sf,
          opening,
          `unsupported className shape on <${tagName}> (manual migration needed)`,
        ),
      );
      continue;
    }

    // Apply: remove old attrs.
    sizeAttr?.remove();
    weightAttr?.remove();

    fileEdited = true;
    totalEdits++;
  }

  if (fileEdited) touchedFiles.push(sf);
}

// ---------- Output ----------

if (dryRun) {
  console.log(
    `[dry-run] would edit ${touchedFiles.length} files, ${totalEdits} elements`,
  );
} else {
  for (const sf of touchedFiles) sf.saveSync();
  console.log(`Edited ${touchedFiles.length} files, ${totalEdits} elements`);
  if (touchedFiles.length > 0) {
    console.log("\nNext step — run biome to sort the merged Tailwind classes:");
    const rels = touchedFiles
      .map((sf) => path.relative(path.join(repoRoot, ".."), sf.getFilePath()))
      .join(" \\\n  ");
    console.log(`\n  npx biome check --write --unsafe \\\n  ${rels}\n`);
  }
}

if (skipLog.length > 0) {
  console.log(
    `\nSkipped ${skipLog.length} elements (manual migration required):\n`,
  );
  for (const s of skipLog) {
    console.log(`  ${path.relative(repoRoot, s.file)}:${s.line}  ${s.reason}`);
    console.log(`    ${s.snippet}`);
  }
}

// ---------- Helpers ----------

function collectRadixImports(sf: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() !== "@radix-ui/themes") continue;
    for (const named of imp.getNamedImports()) {
      // Prefer the local alias (what's actually used in JSX).
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  return names;
}

function isTargetTag(tagName: string, imported: Set<string>): boolean {
  if (RADIX_PLAIN_TARGETS.has(tagName) && imported.has(tagName)) return true;
  if (tagName.includes(".")) {
    const [root, member] = tagName.split(".");
    if (
      RADIX_QUALIFIED_ROOTS.has(root) &&
      RADIX_QUALIFIED_TARGETS.has(member) &&
      imported.has(root)
    ) {
      return true;
    }
  }
  return false;
}

function findAttr(
  opening: JsxSelfClosingElement | ReturnType<JsxElement["getOpeningElement"]>,
  name: string,
): JsxAttribute | undefined {
  for (const a of opening.getAttributes()) {
    if (a.getKind() !== SyntaxKind.JsxAttribute) continue;
    const attr = a as JsxAttribute;
    if (attr.getNameNode().getText() === name) return attr;
  }
  return undefined;
}

/**
 * Read a JSX attribute value as a plain string. Returns the string for:
 *   foo="bar"           → "bar"
 *   foo={"bar"}         → "bar"
 *   foo={`bar`}         → "bar"  (template literal, no expressions)
 * Returns null for anything else (variable, expression, no value).
 */
function readStringLiteralValue(attr: JsxAttribute): string | null {
  const init = attr.getInitializer();
  if (!init) return null;

  if (init.getKind() === SyntaxKind.StringLiteral) {
    return (init as { getLiteralValue: () => string }).getLiteralValue();
  }

  if (init.getKind() === SyntaxKind.JsxExpression) {
    const expr = (init as { getExpression: () => unknown }).getExpression();
    if (!expr) return null;
    const exprNode = expr as {
      getKind: () => SyntaxKind;
      getLiteralValue?: () => string;
      getQuasis?: () => Array<{ getLiteralText: () => string }>;
      getTemplateSpans?: () => unknown[];
    };
    if (exprNode.getKind() === SyntaxKind.StringLiteral) {
      return exprNode.getLiteralValue?.();
    }
    if (exprNode.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
      return exprNode.getLiteralValue?.();
    }
    if (
      exprNode.getKind() === SyntaxKind.TemplateExpression &&
      exprNode.getTemplateSpans &&
      exprNode.getTemplateSpans().length === 0
    ) {
      const quasis = exprNode.getQuasis?.();
      if (quasis?.length === 1) return quasis[0].getLiteralText();
    }
  }
  return null;
}

/**
 * Merge `newClasses` into the element's `className` attribute, handling the
 * common shapes. Returns true on success, false if the className shape is
 * something we don't want to touch (caller should log + skip the element).
 */
function mergeClassName(
  opening: JsxSelfClosingElement | ReturnType<JsxElement["getOpeningElement"]>,
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

  // className="..."
  if (init.getKind() === SyntaxKind.StringLiteral) {
    const current = (
      init as { getLiteralValue: () => string }
    ).getLiteralValue();
    existing.setInitializer(`"${newPrefix} ${current}"`);
    return true;
  }

  // className={...}
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

    // className={"..."} or className={`...`} (no spans)
    if (
      exprNode.getKind() === SyntaxKind.StringLiteral ||
      exprNode.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      const current = exprNode.getLiteralValue?.();
      existing.setInitializer(`"${newPrefix} ${current}"`);
      return true;
    }

    // className={`literal ${expr} more`}
    if (exprNode.getKind() === SyntaxKind.TemplateExpression) {
      const tplExpr = expr as {
        getHead: () => {
          getText: () => string;
          replaceWithText: (t: string) => void;
        };
      };
      const head = tplExpr.getHead();
      const headText = head.getText(); // e.g.  `literal ${
      // headText starts with ` and ends with ${
      const inner = headText.slice(1, -2); // drop leading ` and trailing ${
      head.replaceWithText(`\`${newPrefix} ${inner}\${`);
      return true;
    }

    // className={anythingElse} — wrap in template literal.
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
