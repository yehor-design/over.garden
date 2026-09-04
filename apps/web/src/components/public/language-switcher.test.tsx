import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getInterfaceCopy } from "@/lib/interface-localization";
import { languageHref } from "./language-switcher";

/**
 * Choosing a language is a navigation.
 *
 * What this replaces (OVE-379): 1 938 lines that ran a two-phase distributed
 * commit for a language change, monkey-patched `window.fetch` so any in-flight
 * request anywhere disabled the control, watched `input` across the whole
 * document so one keystroke raised a discard dialog, and finished by replacing
 * the document — which destroyed the unsaved text the dialog had just asked the
 * gardener to confirm losing.
 *
 * The tests that went with it asserted that machinery. What is worth asserting
 * now is much smaller: the link is right, the control needs no client bundle,
 * and none of the retired apparatus is reachable again.
 */

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "language-switcher.tsx"),
  "utf8",
);

/**
 * The code only. The file's own comment names the retired machinery so the next
 * author knows what was removed and why, and a check on raw text would read
 * that history as a relapse.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the language control", () => {
  it("links to the same page in the other language", () => {
    expect(
      languageHref({ locale: "ru", pathname: "/bg/journals", search: "" }),
    ).toBe("/ru/journals");
    expect(
      languageHref({
        locale: "bg",
        pathname: "/ru/journals",
        search: "?kind=plant",
      }),
    ).toBe("/bg/journals?kind=plant");
  });

  it("drops query state the target route does not declare safe", () => {
    expect(
      languageHref({
        locale: "ru",
        pathname: "/bg/journals",
        search: "?kind=plant&token=private",
      }),
    ).toBe("/ru/journals?kind=plant");
  });

  it("needs no client bundle to work", () => {
    // A public choice is an anchor; an unprefixed one is a form over a Server
    // Action. Neither depends on hydration having run.
    expect(source).toContain("<Link");
    const formActions = [...source.matchAll(/<form\n?\s*action=\{([^}]*)\}/g)];
    expect(formActions.length).toBeGreaterThanOrEqual(1);
  });

  it("installs no global side effect and no document-wide listener", () => {
    for (const retired of [
      // The global patch that made any in-flight request disable the control.
      "window.fetch =",
      "browser.fetch",
      // The document-replacement handshake and its fallback timer.
      "pagehide",
      "pageshow",
      "location.reload",
      // The observer that read every keystroke in the document.
      "document.addEventListener",
      "interfaceLocaleChangeCoordinator",
      // Cancelling the anchor is what turned a link into a protocol.
      "preventDefault",
    ]) {
      expect(code, `${retired} must not come back`).not.toContain(retired);
    }

    // `popstate` stays: the link has to reflect the query the reader is on.
    expect(code).toContain("popstate");
  });

  it("keeps the language attributes a reader and a crawler both need", () => {
    expect(source).toContain("hrefLang");
    expect(source).toContain("aria-current");
    expect(source).toContain("lang={config.htmlLang}");
  });
});

describe("the copy the old protocol needed", () => {
  it("is gone from every locale", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const shell = getInterfaceCopy(locale).shell as Record<string, unknown>;
      for (const retired of [
        "languageSwitchingPending",
        "languageMutationPending",
        "languageFlushFailure",
        "languageDiscardTitle",
        "languageDiscardConfirmation",
        "languageDiscardAction",
      ]) {
        expect(shell[retired], `${retired} in ${locale}`).toBeUndefined();
      }
    }
  });

  it("leaves the control's own labels in place", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const shell = getInterfaceCopy(locale).shell;
      expect(shell.languageControlLabel.length).toBeGreaterThan(0);
      expect(shell.languageControlTrigger.length).toBeGreaterThan(0);
    }
  });
});

describe("the workspace form keeps a real endpoint", () => {
  it("passes the Server Action straight to the form", () => {
    // Third time this shape matters: wrapping `formAction` in a closure — to
    // add a refresh, to fire a callback, for anything — swaps the form's real
    // endpoint for React's `javascript:` placeholder, and the control then does
    // nothing until hydration. Caught here before shipping, unlike OVE-377.
    const formActions = [...code.matchAll(/<form\s+action=\{([^}]*)\}/g)].map(
      (match) => match[1]!.trim(),
    );

    expect(formActions.length).toBeGreaterThanOrEqual(1);
    for (const action of formActions) {
      expect(action).toMatch(/^[A-Za-z_$][\w$]*$/);
      expect(code).toContain(`, ${action}] = useActionState(`);
    }
  });
});

describe("a language the reader has not chosen is never prefetched", () => {
  it("marks every cross-locale option `prefetch={false}`", () => {
    // Measured, not assumed: Next strips `Next-Router-Prefetch` before
    // middleware runs, so `proxy.ts` cannot tell a prefetch of `/ru/…` from a
    // reader landing there and writes the preference either way. Left
    // prefetchable, hovering "Русский" on a `/bg/` page rewrote the saved
    // language to `ru` — reproduced in Chromium against a production build on
    // 2026-09-04, before this line existed.
    const links = [...code.matchAll(/<Link\b[\s\S]*?>/g)].map((m) => m[0]!);
    const localeOptions = links.filter((link) =>
      link.includes("data-interface-language-option"),
    );

    expect(localeOptions.length).toBeGreaterThanOrEqual(1);
    for (const option of localeOptions) {
      expect(option).toMatch(/prefetch=\{false\}/);
    }
  });
});
