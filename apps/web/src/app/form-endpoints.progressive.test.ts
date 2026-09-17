import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every form in the product posts to a real endpoint.
 *
 * React gives a `<form>` a real `action` attribute only when what it is handed
 * is a Server Action reference — including the `formAction` that
 * `useActionState` derives from one. Hand it any other function and React
 * renders `action="javascript:throw new Error('React form unexpectedly
 * submitted.')"`, a placeholder it replaces on hydration and never before. A
 * public control that needs the bundle to act is a defect (ADR-0024 D3); Slice
 * 22 paid for that once, on the like control, in production.
 *
 * This reads the source because the defect is invisible in a unit render:
 * outside Next's pipeline every form renders the placeholder, so a
 * rendered-HTML assertion fails for the correct and the broken shape alike.
 * `engagement-controls.progressive.test.ts` and
 * `owner-scope.progressive.test.ts` are the two per-surface versions this one
 * generalises; they stay, because each also asserts what its own form carries.
 */

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A bare identifier, or a plain member path like `actions.publishEntry`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

const FORM_TAGS = [
  "form",
  "OwnerScopedActionForm",
  "OwnerScopedProgressiveForm",
] as const;

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      walk(absolute, out);
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(absolute);
    }
  }
  return out;
}

interface FormAction {
  file: string;
  tag: string;
  expression: string;
}

/**
 * Reads the opening tag of every `<tag …>` in a file.
 *
 * A regex cannot do this. `action={(formData) => submit(formData)}` contains a
 * `>` inside the braces, so `[^>]*?>` stops in the middle of the attribute and
 * the very shape this file exists to catch disappears from the scan. The
 * scanner below tracks brace depth and string quoting, and stops at the `>`
 * that actually closes the tag.
 */
function openingTags(source: string, tag: string): string[] {
  const tags: string[] = [];
  const opener = new RegExp(`<${tag}(?![\\w-])`, "gu");
  for (const match of source.matchAll(opener)) {
    let index = match.index + match[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (index < source.length) {
      const character = source[index]!;
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      } else if (character === ">" && depth === 0) {
        break;
      }
      index += 1;
    }
    tags.push(source.slice(match.index + match[0].length, index));
  }
  return tags;
}

interface FormAction {
  file: string;
  tag: string;
  expression: string;
}

/**
 * A `<form method="get">` is a navigation, not a mutation: its `action` is a
 * URL and the browser performs it with no JavaScript at all. Those are the
 * search and filter forms, and they are outside this rule.
 */
function readFormActions(): FormAction[] {
  const found: FormAction[] = [];
  for (const file of walk(SOURCE_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const tag of FORM_TAGS) {
      for (const attributes of openingTags(source, tag)) {
        if (/\bmethod="get"/u.test(attributes)) continue;
        const marker = attributes.indexOf("action={");
        if (marker < 0) continue;
        let index = marker + "action={".length;
        let depth = 1;
        while (index < attributes.length && depth > 0) {
          if (attributes[index] === "{") depth += 1;
          else if (attributes[index] === "}") depth -= 1;
          if (depth > 0) index += 1;
        }
        found.push({
          file: relative(SOURCE_ROOT, file).split(sep).join("/"),
          tag,
          expression: attributes
            .slice(marker + "action={".length, index)
            .replace(/\s+/gu, " ")
            .trim(),
        });
      }
    }
  }
  return found;
}

const formActions = readFormActions();

describe("every form posts to a real endpoint", () => {
  it("finds the forms it is meant to guard", () => {
    // A regex that silently stops matching would make this file pass forever.
    expect(formActions.length).toBeGreaterThanOrEqual(8);
    expect(
      new Set(formActions.map((entry) => entry.file)).size,
    ).toBeGreaterThan(3);
  });

  it("hands each one a Server Action reference, never a client closure", () => {
    const offenders = formActions.filter(
      (entry) => !REFERENCE.test(entry.expression),
    );
    // `(formData) => …`, `async () => …` and `submit.bind(null, x)` all lose
    // the no-JavaScript endpoint. The message names the file and the shape.
    expect(
      offenders.map(
        (entry) => `${entry.file}: <${entry.tag} action={${entry.expression}}>`,
      ),
    ).toEqual([]);
  });

  it("derives a bare `formAction` from useActionState in the file that uses it", () => {
    for (const entry of formActions) {
      if (entry.expression !== "formAction") continue;
      const source = readFileSync(join(SOURCE_ROOT, entry.file), "utf8");
      expect(source, entry.file).toMatch(
        /,\s*formAction\s*\]\s*=\s*useActionState/u,
      );
    }
  });
});

describe("no migrated control lost its endpoint", () => {
  it("keeps every `ui/` control a real element that a form can submit", () => {
    const controls = {
      "components/ui/input.tsx": "<input",
      "components/ui/textarea.tsx": "<textarea",
      "components/ui/select.tsx": "<select",
      "components/ui/checkbox.tsx": '<input\n          type="checkbox"',
      "components/ui/radio.tsx": '<input\n          type="radio"',
      "components/ui/switch.tsx": '<input\n          type="checkbox"',
      "components/ui/file-drop.tsx": "<input\n        ref={ref}",
      "components/ui/hidden-field.tsx": '<input type="hidden"',
      "components/ui/button.tsx": "<button",
    } as const;
    for (const [file, marker] of Object.entries(controls)) {
      expect(readFileSync(join(SOURCE_ROOT, file), "utf8"), file).toContain(
        marker,
      );
    }
  });

  it("never gives a `ui/` control a client closure for an action", () => {
    for (const entry of formActions) {
      if (!entry.file.startsWith("components/ui/")) continue;
      expect(entry.expression, entry.file).toMatch(REFERENCE);
    }
  });
});
