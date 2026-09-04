import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * There is one place that asks somebody for a password.
 *
 * Fourteen pages used to embed `GardenAuthPanel`, and the two defects that came
 * out of that were not oversights anybody could have caught by reading a diff:
 * Google rendered on two of the fourteen because a default said `false`, and ten
 * forgot `postAuthPath` so signing in from the feed landed the reader in the
 * workspace. Both are impossible once providers are drawn in one module and the
 * return path is read in one module — which is exactly what this check keeps
 * true, so a fifteenth page cannot bring them back quietly.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

/** The one screen, and the one module that renders its form. */
const AUTH_SURFACE = "src/app/(default)/auth/auth-surface.tsx";
const AUTH_ROUTES = [
  "src/app/(default)/auth/sign-in/page.tsx",
  "src/app/(default)/auth/sign-up/page.tsx",
];

describe("one sign-in surface", () => {
  const files = collectSources(SOURCE_ROOT);

  it("is imported only by its own two routes", () => {
    const importers = files.filter(
      ({ path, text }) =>
        path !== AUTH_SURFACE &&
        !path.endsWith(".test.tsx") &&
        /from "[^"]*auth-surface"/.test(text),
    );

    expect(importers.map(({ path }) => path).sort()).toEqual(AUTH_ROUTES);
  });

  it("leaves no other password field anywhere in the app", () => {
    const allowed = new Set([
      AUTH_SURFACE,
      // Recovery and account management legitimately take a password.
      "src/app/(default)/auth/reset-password/reset-password-form.tsx",
      "src/app/(default)/garden/account-methods-panel.tsx",
    ]);

    const offenders = files
      .filter(({ path, text }) => {
        if (allowed.has(path) || path.includes(".test.")) return false;
        return /type="password"/.test(text);
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("keeps the retired panel deleted", () => {
    expect(files.some(({ path }) => path.includes("garden-auth-panel"))).toBe(
      false,
    );
    expect(files.some(({ path }) => path.includes("auth-intent-surface"))).toBe(
      false,
    );
  });

  it("sends the navigation's sign-in item to that one screen", () => {
    const navigation = readFileSync(
      join(SOURCE_ROOT, "lib/site-shell-navigation.ts"),
      "utf8",
    );
    // "Sign in" and "My garden" pointed at `/garden` together until OVE-378.
    expect(navigation).toContain('"/auth/sign-in"');
  });
});

function collectSources(root: string): Array<{ path: string; text: string }> {
  const found: Array<{ path: string; text: string }> = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      found.push({
        path: absolute.slice(process.cwd().length + 1),
        text: readFileSync(absolute, "utf8"),
      });
    }
  };

  walk(root);
  return found;
}
