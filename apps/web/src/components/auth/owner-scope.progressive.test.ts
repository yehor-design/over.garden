import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A control that needs hydration cannot be seen by a rendered-HTML assertion:
 * outside Next's pipeline every form renders React's placeholder, so the
 * correct and the broken shape look identical. This reads the source instead.
 *
 * React gives a form a real endpoint only from a Server Action reference, or
 * the `formAction` `useActionState` derives from one. `OwnerScopedActionForm`
 * adapts a `(formData)` action inside a client closure, which React answers
 * with `action="javascript:throw new Error('React form unexpectedly
 * submitted.')"`. `OwnerScopedProgressiveForm` passes the reference through,
 * and the owner curation surfaces (ADR-0026 D10) use that one.
 */
const ROOT = join(import.meta.dirname, "..", "..");

const PROGRESSIVE_SURFACES = [
  "app/(default)/garden/catalog/queue/page.tsx",
  "app/(default)/garden/catalog/sources/page.tsx",
  "app/catalog-owner-card-controls.tsx",
] as const;

const PROGRESSIVE_ACTIONS = [
  "app/(default)/garden/catalog/queue/actions.ts",
  "app/(default)/garden/catalog/sources/actions.ts",
  "app/catalog-owner-card-actions.ts",
] as const;

describe("owner forms that decide before hydration", () => {
  it("hands the action to useActionState unwrapped", async () => {
    const source = await readFile(
      join(ROOT, "components", "auth", "owner-scope.tsx"),
      "utf8",
    );
    const progressive = source.slice(
      source.indexOf("export function OwnerScopedProgressiveForm"),
    );
    // Falsify by wrapping `action` in a closure here: the browser proof then
    // finds no $ACTION_ID field and fails.
    expect(progressive).toContain(
      "useActionState<unknown, FormData>(\n    action,\n    undefined,\n  );",
    );
    expect(progressive).not.toContain("=> action(formData)");
  });

  it("uses that form on every owner curation surface, with a bare reference", async () => {
    for (const relative of PROGRESSIVE_SURFACES) {
      const source = await readFile(join(ROOT, relative), "utf8");
      expect(source, relative).toContain("OwnerScopedProgressiveForm");
      expect(source, relative).not.toMatch(/<OwnerScopedActionForm\b/u);
      for (const match of source.matchAll(
        /<OwnerScopedProgressiveForm[\s\S]*?action=\{([^}]+)\}/gu,
      )) {
        // An arrow function or a `.bind` here would be a client closure.
        expect(match[1]?.trim(), relative).toMatch(/^[A-Za-z_$][\w$]*$/u);
      }
    }
  });

  it("shapes every one of those actions the way useActionState calls it", async () => {
    for (const relative of PROGRESSIVE_ACTIONS) {
      const source = await readFile(join(ROOT, relative), "utf8");
      const exported = [
        ...source.matchAll(/export async function (\w+Action)\(([\s\S]*?)\)/gu),
      ];
      expect(exported.length, relative).toBeGreaterThan(0);
      for (const [, name, parameters] of exported) {
        expect(parameters?.replace(/\s+/gu, " ").trim(), `${relative}:${name}`)
          .toBe("_previousState: unknown, formData: FormData,");
      }
    }
  });
});
