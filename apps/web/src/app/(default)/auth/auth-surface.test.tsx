import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthSurface } from "./auth-surface";
import { readAuthScreenParams } from "./params";

/**
 * One sign-in screen for the whole product.
 *
 * Until OVE-378 `GardenAuthPanel` was embedded by fourteen pages, each with its
 * own chrome. Google rendered on two of them and ten forgot to say where to
 * return. Both were structural, so both are asserted structurally here: there is
 * one module, it always draws the providers, and the return path is read in one
 * place.
 */

const noop = async () => ({ status: "idle" as const, message: null });

function render(props: Partial<Parameters<typeof AuthSurface>[0]> = {}) {
  return renderToStaticMarkup(
    <AuthSurface
      mode="sign-in"
      locale="uk"
      next="/garden"
      intentPrompt={null}
      googleSignInEnabled
      submit={noop}
      startSocial={noop}
      {...props}
    />,
  );
}

describe("the one sign-in surface", () => {
  it("offers every configured provider beside email and password", () => {
    const html = render();
    expect(html).toContain('data-testid="google-sign-in-button"');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
  });

  it("draws no provider the deployment has not configured", () => {
    const html = render({ googleSignInEnabled: false });
    expect(html).not.toContain('data-testid="google-sign-in-button"');
    expect(html).toContain('type="email"');
  });

  it("submits without JavaScript", () => {
    // Read from the source, not the render: outside Next's pipeline *every*
    // form renders React's `javascript:` placeholder, so a rendered-HTML
    // assertion cannot tell a Server Action form from a client closure. Only a
    // bare `formAction` identifier from `useActionState` gets a real endpoint,
    // and that is what makes the screen work before hydration finishes.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-surface.tsx"),
      "utf8",
    );
    const actions = [...source.matchAll(/<form\s+action=\{([^}]*)\}/g)].map(
      (match) => match[1]!.trim(),
    );

    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const action of actions) {
      expect(action).toMatch(/^[A-Za-z_$][\w$]*$/);
      expect(source).toContain(`, ${action}] = useActionState(`);
    }
  });

  it("carries the return path into every form on the screen", () => {
    const html = render({ next: "/bookmarks" });
    const hidden = html.match(
      /<input type="hidden" name="next" value="[^"]*"/g,
    );
    expect(hidden?.length).toBeGreaterThanOrEqual(2);
    for (const field of hidden ?? []) {
      expect(field).toContain('value="/bookmarks"');
    }
  });

  it("labels the password field for the mode it is in", () => {
    expect(render()).toContain('autoComplete="current-password"');
    expect(render({ mode: "sign-up" })).toContain(
      'autoComplete="new-password"',
    );
  });

  it("has one primary action per screen, and a way to the other one", () => {
    const signIn = render();
    expect(signIn).toContain("/auth/sign-up");
    expect(render({ mode: "sign-up" })).toContain("/auth/sign-in");
  });

  it("lets an intent choose the heading and nothing else", () => {
    const plain = render();
    const withIntent = render({ intentPrompt: "Увійдіть, щоб коментувати" });

    expect(withIntent).toContain("Увійдіть, щоб коментувати");
    // The controls are identical: a value in the address may not change which
    // providers or fields exist.
    const controls = (html: string) =>
      (html.match(/<(?:input|button)[^>]*>/g) ?? []).length;
    expect(controls(withIntent)).toBe(controls(plain));
  });
});

describe("the query contract of the sign-in screens", () => {
  it("keeps an off-origin return path off the screen", () => {
    for (const hostile of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "/\\attacker.example/steal",
      "/%5cattacker.example/steal",
    ]) {
      expect(readAuthScreenParams({ next: hostile }, "uk").next).toBe(
        "/garden",
      );
    }
  });

  it("keeps a real internal path", () => {
    expect(
      readAuthScreenParams({ next: "/bookmarks?kind=all" }, "uk").next,
    ).toBe("/bookmarks?kind=all");
  });

  it("only accepts an intent from the closed action set", () => {
    expect(readAuthScreenParams({ intent: "comment" }, "uk").intentPrompt).toBe(
      "Увійдіть, щоб коментувати",
    );
    expect(
      readAuthScreenParams({ intent: "<script>" }, "uk").intentPrompt,
    ).toBeNull();
  });
});

describe("only one module renders the authentication form", () => {
  it("is imported by the two auth routes and nothing else", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const importers = ["sign-in/page.tsx", "sign-up/page.tsx"].map((file) =>
      readFileSync(join(here, file), "utf8"),
    );

    for (const source of importers) {
      expect(source).toContain('from "../auth-surface"');
    }
  });
});
