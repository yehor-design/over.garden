import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

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
  "app/catalog-evidence-route.tsx",
  "app/catalog-owner-card-controls.tsx",
  // `OVE-450`: the public profile's follow, unfollow, report and block, and
  // the lineage passport's follow and question. Thirty-three call sites across
  // seventeen files still used the closure form when Slice 28 began; these are
  // the first six converted, and each page-family task carries its own share.
  "components/public/public-profile.tsx",
  // Since `OVE-467` the passport is a static document and its forms live in
  // the request-time regions beside it.
  "app/[locale]/lineage/objects/[objectId]/passport-regions.tsx",
  // `OVE-454`: join, leave, contribute, report and block on a community.
  "components/public/public-community.tsx",
  // `OVE-456`: the reader's own pages and the erasure family. Removing a
  // bookmark or a wishlist item, asking for erasure, and every control on the
  // two moderation surfaces.
  "app/[locale]/bookmarks/page.tsx",
  "app/[locale]/wishlist/page.tsx",
  "app/(default)/erasure/page.tsx",
  "app/(default)/account/communities/[slug]/page.tsx",
  "app/(default)/garden/privacy/erasure-requests/page.tsx",
  // `OVE-457`: the workspace. The garden home's wishlist intent, both lineage
  // inboxes, the living object's passport and its two controls, and the
  // profile with its editor.
  "app/(default)/garden/lineage/claims/page.tsx",
  "app/(default)/garden/lineage/invitations/claim/page.tsx",
  "app/(default)/garden/objects/[objectId]/page.tsx",
  "app/(default)/garden/objects/[objectId]/catalog-resolve-control.tsx",
  "app/(default)/garden/objects/[objectId]/location-privacy-control.tsx",
  "app/(default)/garden/profile/page.tsx",
  "app/(default)/garden/profile/owner-profile-editor.tsx",
  // `OVE-459`: the last one. Comment moderation was the thirty-third call
  // site, and the closure form is deleted with it.
  "app/(default)/account/moderation/comments/page.tsx",
] as const;

const PROGRESSIVE_ACTIONS = [
  "app/(default)/garden/catalog/queue/actions.ts",
  "app/(default)/garden/catalog/sources/actions.ts",
  "app/catalog-owner-card-actions.ts",
  "app/[locale]/[profileHandle]/actions.ts",
  "app/[locale]/lineage/objects/[objectId]/actions.ts",
  "app/[locale]/communities/[slug]/actions.ts",
  "app/(default)/bookmarks/actions.ts",
  "app/(default)/wishlist/actions.ts",
  "app/(default)/erasure/actions.ts",
  "app/(default)/account/communities/[slug]/actions.ts",
  "app/(default)/garden/privacy/erasure-requests/actions.ts",
  "app/(default)/garden/lineage/claims/actions.ts",
  "app/(default)/garden/lineage/invitations/claim/actions.ts",
  "app/(default)/garden/objects/[objectId]/actions.ts",
  "app/(default)/account/moderation/comments/actions.ts",
] as const;

/** Every `.tsx` under `src`, so the count below is of the repository. */
function everyComponentFile(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      everyComponentFile(absolute, out);
      continue;
    }
    if (entry.endsWith(".tsx")) out.push(absolute);
  }
  return out;
}

describe("owner forms that decide before hydration", () => {
  it("has no closure form left anywhere, and no way to import one", async () => {
    // `OVE-459` AC6, and the criterion says to check rather than assume. The
    // sixteen other files belonged to five earlier tasks; a whole-repository
    // count is the only assertion that does not take their word for it.
    const offenders: string[] = [];
    for (const absolute of everyComponentFile(ROOT)) {
      const source = await readFile(absolute, "utf8");
      if (/<OwnerScopedActionForm\b/u.test(source)) {
        offenders.push(relative(ROOT, absolute));
      }
    }
    expect(offenders, offenders.join(", ")).toEqual([]);

    // And the shape itself is gone, so it cannot be reached for again.
    const ownerScope = await readFile(
      join(ROOT, "components", "auth", "owner-scope.tsx"),
      "utf8",
    );
    expect(ownerScope).not.toContain("export function OwnerScopedActionForm");
  });

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
