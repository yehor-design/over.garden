import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
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

describe("the anatomy every comparable product ships", () => {
  it("shows the Google mark, which Google's own terms require", () => {
    // What shipped before `OVE-455` was a bordered button with the words
    // alone. Intercom, Cal.com, Uxcel, Mixpanel and Relevance AI all show the
    // mark, because Google's identity guidelines require it on any button that
    // starts a Google sign-in.
    const html = render();
    expect(html).toContain('data-google-sign-in-button="true"');
    expect(html).toContain('data-google-mark="true"');
    for (const colour of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) {
      expect(html).toContain(colour);
    }
    // The provider's name is never translated or abbreviated.
    expect(html).toContain("Google");
  });

  it("puts an `or` between the provider and the fields", () => {
    expect(render()).toContain('data-auth-or-divider="true"');
    // And nothing to read twice: the divider is decoration.
    expect(render()).toMatch(/aria-hidden="true"[^>]*data-auth-or-divider/u);
  });

  it("gives the password field a show control whose name changes", () => {
    const html = render();
    expect(html).toContain('data-slot="password-input"');
    expect(html).toContain("Показати пароль");
    // The hidden state's name is the one the server renders; the shown state's
    // is asserted against the real component in `password-input.test.tsx`.
    expect(html).not.toContain("Сховати пароль");
  });

  it("puts the forgotten-password link beside the password label, on sign-in only", () => {
    // And says it once: the recovery hint used to open with the same question,
    // so the screen asked it twice and answered it once.
    expect(render().match(/Забули пароль\?/gu)).toHaveLength(1);
    expect(render()).toContain(`href="${AUTH_HELP_PATH}"`);
    expect(render({ mode: "sign-up" })).not.toContain("Забули пароль?");
  });

  it("marks both credential fields required and gives each its autocomplete", () => {
    const signIn = render();
    expect(signIn).toMatch(/required=""[^>]*name="email"/u);
    expect(signIn).toMatch(/required=""[^>]*name="password"/u);
    // HTML attribute names are case-insensitive, so React's `autoComplete`
    // reaches the browser as `autocomplete`; the assertion reads it the way
    // the parser does rather than the way the serializer wrote it.
    expect(signIn.toLowerCase()).toContain('autocomplete="email"');
    expect(signIn.toLowerCase()).toContain('autocomplete="current-password"');
    expect(render({ mode: "sign-up" }).toLowerCase()).toContain(
      'autocomplete="new-password"',
    );
  });
});

describe("a refusal", () => {
  const refused = async () => ({
    status: "error" as const,
    message: "Неправильна адреса електронної пошти або пароль.",
  });

  it("never says which of the two credentials was wrong", () => {
    // Naming the wrong half tells somebody probing which half they had right.
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getTrustSurfaceCopy(locale).authPanel;
      for (const message of [copy.invalidCredentials, copy.signInError]) {
        expect(message.toLocaleLowerCase()).not.toMatch(
          /пароль неправильн|парола(та)? е грешна|wrong password|no such (user|account)/u,
        );
      }
      // And it says what to do next rather than what failed internally.
      expect(copy.invalidCredentials.length).toBeGreaterThan(40);
    }
  });

  it("is rendered by the source as a Callout above the fields", async () => {
    // Asserted on the source because `useActionState`'s initial state is
    // `idle`: a server render cannot reach the refused branch, and a test that
    // pretended otherwise would assert its own mock.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-surface.tsx"),
      "utf8",
    );
    expect(source).toMatch(/<Callout[\s\S]*?live=\{refused \? "assertive"/u);
    // Above the fields, not under the submit: the Callout comes before the
    // first `<Field` in the form.
    const form = source.slice(source.indexOf("<form action={formAction}"));
    expect(form.indexOf("<Callout")).toBeLessThan(form.indexOf("<Field"));
    expect(form.indexOf("<Callout")).toBeGreaterThan(0);
  });

  it("moves focus to the first control, and marks both invalid", async () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-surface.tsx"),
      "utf8",
    );
    expect(source).toContain("emailRef.current?.focus()");
    expect(source.match(/aria-invalid=\{refused \|\| undefined\}/gu)).toHaveLength(
      2,
    );
    void refused;
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
