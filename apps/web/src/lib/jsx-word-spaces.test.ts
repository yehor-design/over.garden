import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * A space between two words lives inside the text (`OVE-478`).
 *
 * React writes `<!-- -->` between two pieces of text it renders side by side,
 * so `{label}{" "}<time>` and `{a} {b}` reach the browser as
 * `label<!-- --> <time>`. Chromium drops a space that stands alone after such
 * a comment from the accessibility tree: Orca read the garden's group heading
 * as «Простори3» and a request's date as «Надіслано24 вересня», while the page
 * showed the space. A space written inside the text — `{`${label} `}` — is
 * one text node and is kept.
 *
 * This finds a lone space (`{" "}`, or a space on its own between two
 * expressions) directly after text or an expression that renders text, and
 * directly before more of either. It reads the source, so it cannot tell an
 * expression that renders an element from one that renders text; the fix is
 * the same either way and costs nothing.
 */

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function tsxFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) tsxFiles(absolute, out);
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
      out.push(absolute);
    }
  }
  return out;
}

const WORD_END = /[\p{L}\p{N}]\s*$/u;
const WORD_START = /^\s*[\p{L}\p{N}]/u;

/** A child that renders text, and whether it can end or start a word. */
function textLike(child: ts.JsxChild, side: "end" | "start"): boolean {
  if (ts.isJsxText(child)) {
    const text = child.text;
    if (!text.trim()) return false;
    return side === "end" ? WORD_END.test(text) : WORD_START.test(text);
  }
  if (ts.isJsxExpression(child)) {
    const expression = child.expression;
    if (!expression) return false;
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      const text = expression.text;
      return side === "end" ? WORD_END.test(text) : WORD_START.test(text);
    }
    return (
      ts.isIdentifier(expression) ||
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression) ||
      ts.isCallExpression(expression) ||
      ts.isTemplateExpression(expression) ||
      ts.isNumericLiteral(expression)
    );
  }
  // An element may begin with a word; it is text after a lone space either way.
  return (
    side === "start" &&
    (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
  );
}

function loneSpace(child: ts.JsxChild): boolean {
  if (ts.isJsxText(child)) return /^[ \t]+$/u.test(child.text);
  if (ts.isJsxExpression(child) && child.expression) {
    const expression = child.expression;
    return (
      (ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)) &&
      /^[ \t]+$/u.test(expression.text)
    );
  }
  return false;
}

/** A `{/* comment *\/}` renders nothing and does not separate anything. */
function rendered(children: readonly ts.JsxChild[]): ts.JsxChild[] {
  return children.filter(
    (child) =>
      !(ts.isJsxExpression(child) && child.expression === undefined) &&
      !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
  );
}

function findLoneSpaces(file: string, text = readFileSync(file, "utf8")) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const children = rendered(node.children);
      for (let index = 1; index < children.length - 1; index += 1) {
        const child = children[index]!;
        if (
          loneSpace(child) &&
          textLike(children[index - 1]!, "end") &&
          textLike(children[index + 1]!, "start")
        ) {
          const { line } = source.getLineAndCharacterOfPosition(
            child.getStart(source),
          );
          found.push(`${relative(SOURCE_ROOT, file)}:${line + 1}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("a space between two words", () => {
  it("finds the shapes Orca read as one word, and only those", () => {
    const count = (jsx: string) =>
      findLoneSpaces(join(SOURCE_ROOT, "example.tsx"), jsx).length;
    expect(count(`<h2>{title}{" "}<span>3</span></h2>`)).toBe(1);
    expect(count(`<p>{copy.submitted} {formatDate(at)}</p>`)).toBe(1);
    expect(count(`<p>Use the canonical{" "}<a href="/">flow</a></p>`)).toBe(1);
    expect(count(`<h2>{\`\${title} \`}<span>3</span></h2>`)).toBe(0);
    expect(count(`<p><span>a</span>{" "}<span>b</span></p>`)).toBe(0);
    expect(count(`<p>Label:{" "}{value}</p>`)).toBe(0);
    expect(count(`<p>{a}{/* why */}{" "}</p>`)).toBe(0);
  });

  it("is written inside the text, where Chromium keeps it", () => {
    const found = tsxFiles(SOURCE_ROOT).flatMap((file) => findLoneSpaces(file));
    expect(found).toEqual([]);
  });
});
