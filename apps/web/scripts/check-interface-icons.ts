import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const BRAND_SVG_FILES = new Set([
  "src/components/site-shell/over-garden-logo.tsx",
  "src/components/auth/google-sign-in-button.tsx",
]);
const OTHER_ICONS =
  /^(?:lucide(?:-react)?|react-icons|@radix-ui\/react-icons|@heroicons\/|@tabler\/icons|@fortawesome\/|phosphor-react)/;
const EMOJI = /\p{Extended_Pictographic}/u;
export interface IconViolation {
  file: string;
  line: number;
  reason: string;
}

/** AST checks actual imports and controls, not quoted examples or comments. */
export function scanInterfaceIcons(
  file: string,
  source: string,
): IconViolation[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors: IconViolation[] = [];
  const report = (node: ts.Node, reason: string) =>
    errors.push({
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      reason,
    });
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const name = node.moduleSpecifier.text;
      if (name === "@/components/icons" && !node.importClause?.isTypeOnly)
        report(
          node,
          "Import the named local icon module so unrelated glyphs stay out of the route bundle.",
        );
      if (OTHER_ICONS.test(name))
        report(
          node,
          "Use @/components/icons; other interface icon families are retired.",
        );
      if (name.startsWith("@phosphor-icons/react")) {
        if (!file.startsWith("src/components/icons/"))
          report(node, "Consume Phosphor through @/components/icons.");
        else if (
          !node.importClause?.isTypeOnly &&
          !name.startsWith("@phosphor-icons/react/dist/ssr/")
        )
          report(node, "Use a narrow server-compatible Phosphor import.");
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(tree);
      if (name === "svg" && !BRAND_SVG_FILES.has(file))
        report(
          node,
          "Bespoke interface SVG: use a Phosphor glyph; brand exceptions are explicit.",
        );
      if (["button", "Button", "IconButton"].includes(name)) {
        const text = ts.isJsxOpeningElement(node)
          ? node.parent.getText(tree)
          : node.getText(tree);
        if (EMOJI.test(text))
          report(
            node,
            "Emoji is not an interface control glyph. Authored document emoji stays content.",
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return errors;
}
export function checkInterfaceIcons(root: string): IconViolation[] {
  const errors: IconViolation[] = [];
  const walk = (dir: string) => {
    for (const item of readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const file = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
        errors.push(
          ...scanInterfaceIcons(
            file,
            readFileSync(path.join(root, file), "utf8"),
          ),
        );
    }
  };
  walk("src");
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (OTHER_ICONS.test(dependency))
      errors.push({
        file: "package.json",
        line: 1,
        reason: `Remove retired icon dependency ${dependency}.`,
      });
  }
  if (
    JSON.parse(readFileSync(path.join(root, "components.json"), "utf8"))
      .iconLibrary !== "phosphor"
  )
    errors.push({
      file: "components.json",
      line: 1,
      reason: "Scaffold icons must use Phosphor.",
    });
  return errors;
}
if (process.argv[1]?.endsWith("check-interface-icons.ts")) {
  const errors = checkInterfaceIcons(process.cwd());
  for (const error of errors)
    console.error(`${error.file}:${error.line}: ${error.reason}`);
  console.log(`Interface icon gate: ${errors.length} violations`);
  if (errors.length) process.exitCode = 1;
}
