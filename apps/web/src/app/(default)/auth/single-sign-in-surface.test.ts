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
const SIGN_IN_HREF = "src/lib/navigation/sign-in-href.ts";
const SIGN_IN_HREF_RELATIVE = "lib/navigation/sign-in-href.ts";
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

  it("lets one module decide what a sign-in link says", () => {
    // The check that used to stand here asked whether the *navigation file*
    // mentioned "/auth/sign-in". It did — and the site header still shipped a
    // hard-coded `href="/garden"` beside the label it read from that same file,
    // so the reader reached the workspace empty state and had to press "sign
    // in" a second time. A guard that reads one file cannot see the file that
    // is wrong. This one reads them all: nobody but `sign-in-href.ts` may spell
    // the destination.
    const offenders = files
      .filter(({ path, text }) => {
        if (path === SIGN_IN_HREF || path.includes(".test.")) return false;
        // `/api/auth/sign-in/...` is Better Auth's own endpoint, not the screen.
        const withoutApi = text.replace(/\/api\/auth\/sign-[a-z]+/g, "");
        // A module specifier such as `@/app/(default)/auth/sign-in-prompt` is
        // an import, not a URL.
        const withoutImports = withoutApi.replace(
          /from "[^"]*"|import\("[^"]*"\)/g,
          "",
        );
        return /["'`(]\/auth\/sign-(in|up)/.test(withoutImports);
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("routes every sign-in link through that module", () => {
    const helper = readFileSync(join(SOURCE_ROOT, SIGN_IN_HREF_RELATIVE), "utf8");
    expect(helper).toContain('const SIGN_IN_PATH = "/auth/sign-in"');
    expect(helper).toContain('const SIGN_UP_PATH = "/auth/sign-up"');

    const navigation = readFileSync(
      join(SOURCE_ROOT, "lib/site-shell-navigation.ts"),
      "utf8",
    );
    expect(navigation).toContain("buildSignInHref(");
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
