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
    // `username`, on both screens (`OVE-504`, criterion 3): the token password
    // managers pair with the password beside it to save and fill the pair.
    expect(signIn.toLowerCase()).toContain('autocomplete="username"');
    expect(signIn.toLowerCase()).toContain('autocomplete="current-password"');
    const signUp = render({ mode: "sign-up" }).toLowerCase();
    expect(signUp).toContain('autocomplete="username"');
    expect(signUp).toContain('autocomplete="new-password"');
    // Nothing that blocks a paste or a password manager.
    for (const html of [signIn, signUp]) {
      expect(html).not.toMatch(/onpaste|oncopy|autocomplete="off"/u);
    }
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
    expect(source).toMatch(/<Callout[\s\S]*?live=\{alarming \? "assertive"/u);
    // Above the fields, not under the submit: the Callout comes before the
    // first `<Field` in the form.
    const form = source.slice(source.search(/<form\s+action=\{formAction\}/u));
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

  it("reads notices, provider errors and verification from closed sets only", () => {
    expect(
      readAuthScreenParams({ notice: "password-reset" }, "uk").notice,
    ).toBe("password-reset");
    expect(
      readAuthScreenParams({ notice: "<b>hi</b>" }, "uk").notice,
    ).toBeNull();

    // A provider code becomes the reader's sentence, never the raw code.
    const provider = readAuthScreenParams(
      { error: "account_not_linked" },
      "uk",
    ).providerError;
    expect(provider).toContain("OverGarden");
    expect(provider).not.toContain("account_not_linked");
    expect(
      readAuthScreenParams({ error: "<script>" }, "uk").providerError,
    ).not.toContain("<script>");

    // A verification link comes back signed in, or with Better Auth's error.
    expect(readAuthScreenParams({ verified: "1" }, "uk").verification).toBe(
      "done",
    );
    const expired = readAuthScreenParams(
      { verified: "1", error: "TOKEN_EXPIRED" },
      "uk",
    );
    expect(expired.verification).toBe("expired");
    // …and that error is the link's, not a provider's.
    expect(expired.providerError).toBeNull();
  });

  it("knows whether `next` was given or is only the default", () => {
    expect(readAuthScreenParams({}, "uk").hasNext).toBe(false);
    expect(readAuthScreenParams({ next: "/feed" }, "uk").hasNext).toBe(true);
    expect(
      readAuthScreenParams({ next: "https://attacker.example" }, "uk").hasNext,
    ).toBe(false);
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

describe("the focused screen (OVE-504)", () => {
  it("names the mode it is in and offers the other, carrying the return path", () => {
    for (const mode of ["sign-in", "sign-up"] as const) {
      const html = render({ mode, next: "/communities/tomatoes" });
      const nav = html.slice(
        html.indexOf('data-auth-mode-switch="true"'),
        html.indexOf("</nav>"),
      );
      expect(html).toContain('aria-label="Вхід або реєстрація"');
      expect(nav.match(/aria-current="page"/gu)).toHaveLength(1);
      expect(nav).toMatch(
        mode === "sign-in"
          ? /<a(?=[^>]*aria-current="page")(?=[^>]*href="\/auth\/sign-in\?next=%2Fcommunities%2Ftomatoes")[^>]*>/u
          : /<a(?=[^>]*aria-current="page")(?=[^>]*href="\/auth\/sign-up\?next=%2Fcommunities%2Ftomatoes")[^>]*>/u,
      );
      expect(nav).toContain("/auth/sign-in?next=%2Fcommunities%2Ftomatoes");
      expect(nav).toContain("/auth/sign-up?next=%2Fcommunities%2Ftomatoes");
    }
  });

  it("is one column with one h1, whichever mode", () => {
    for (const mode of ["sign-in", "sign-up"] as const) {
      const html = render({ mode });
      expect(html).toContain(`data-auth-frame="${mode}"`);
      expect(html.match(/<h1\b/gu)).toHaveLength(1);
    }
    expect(render()).toMatch(/<h1[^>]*>Вхід до OverGarden<\/h1>/u);
    expect(render({ mode: "sign-up" })).toMatch(
      /<h1[^>]*>Новий обліковий запис<\/h1>/u,
    );
  });

  it("says each reason it was opened in its own sentence", () => {
    const expired = render({ notice: "intent-expired" });
    expect(expired).toContain('data-auth-notice="intent-expired"');
    expect(expired).toContain("Минуло понад 15 хвилин");

    const reset = render({ notice: "password-reset" });
    expect(reset).toMatch(
      /<div(?=[^>]*data-tone="success")(?=[^>]*data-auth-notice="password-reset")[^>]*>/u,
    );
    expect(reset).toContain("Пароль оновлено");

    const tab = render({ notice: "return-to-tab" });
    expect(tab).toContain(
      "Неопублікований текст залишився в попередній вкладці",
    );

    const verification = render({ verificationExpired: true });
    expect(verification).toContain('data-auth-notice="verification-expired"');

    const provider = render({
      providerError: "Соціальний вхід не завершився.",
    });
    expect(provider).toContain('data-auth-message="provider"');
    expect(provider).toContain("Соціальний вхід не завершився.");
  });

  it("keeps the help link and the way back on the reader's path", () => {
    const html = render({
      next: "/auth/intent/resume?intent=token",
      cancelHref: "/journal/first-public-harvest",
    });
    expect(html).toContain(
      'href="/auth/help?next=%2Fauth%2Fintent%2Fresume%3Fintent%3Dtoken"',
    );
    // Back goes to the page the action was on, never into the resume route.
    expect(html).toMatch(
      /<a(?=[^>]*data-auth-cancel="true")(?=[^>]*href="\/journal\/first-public-harvest")[^>]*>/u,
    );
  });

  it("keeps what the reader typed above the boundary a lost request re-mounts", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-surface.tsx"),
      "utf8",
    );
    const surface = source.slice(
      source.indexOf("export function AuthSurface"),
      source.indexOf("function CredentialForm"),
    );
    expect(surface).toContain('const [email, setEmail] = useState("")');
    expect(surface).toContain('const [password, setPassword] = useState("")');
    expect(surface).toContain("<TransportBoundary");
    expect(source).toMatch(/value=\{email\}/u);
    expect(source).toMatch(/value=\{password\}/u);
  });

  it("announces who signed in, and leaves the other tab's words alone when asked to", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "auth-surface.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /announceSessionSignal\(\{\s*type: "signed_in",\s*ownerUserId: state\.ownerUserId \?\? null,/u,
    );
    const effect = source.slice(
      source.indexOf('if (notice === "return-to-tab")'),
      source.indexOf("window.location.assign(state.redirectTo)"),
    );
    // Returning to the other tab happens before, and instead of, navigating.
    expect(effect).toContain("onReturnToTab();");
    expect(effect).toContain("return;");
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
