import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "./reset-password-form";

const mocks = vi.hoisted(() => ({
  error: null as string | null,
  token: "opaque-reset-token",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "token") return mocks.token;
      if (key === "error") return mocks.error;
      return null;
    },
  }),
}));

vi.mock("../auth-actions", () => ({
  resetPasswordAction: async () => ({ status: "idle", message: null }),
}));

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    mocks.token = "opaque-reset-token";
    mocks.error = null;
  });

  it("renders the ready state in the selected locale", () => {
    const html = renderToStaticMarkup(<ResetPasswordForm locale="bg" />);

    expect(html).toContain("Изберете нова парола");
    expect(html).toContain("Потвърждаване на паролата");
    expect(html).toContain("Обновяване на паролата");
    expect(html).not.toMatch(/Choose a new password|Confirm password/i);
  });

  it("carries the token in the form, and nowhere a reader could hand it on", () => {
    // The token moved out of a closure and into a hidden field when the form
    // became a Server Action (`OVE-455`), because a form is what a browser can
    // submit without JavaScript. That is not new exposure: the reader is
    // already on the address that carries it, and it posts back to the same
    // origin. What must stay true is that it reaches nothing else — no link, no
    // visible text, no other attribute somebody could copy or share.
    const html = renderToStaticMarkup(<ResetPasswordForm locale="bg" />);
    const occurrences = [...html.matchAll(/opaque-reset-token/gu)];
    expect(occurrences).toHaveLength(1);
    expect(html).toContain(
      '<input type="hidden" name="token" value="opaque-reset-token"/>',
    );
    expect(html).not.toMatch(/href="[^"]*opaque-reset-token/u);
    expect(html).not.toMatch(/action="[^"]*opaque-reset-token/u);
    expect(html).not.toMatch(/>[^<]*opaque-reset-token[^<]*</u);
  });

  it("posts to a real endpoint rather than a client closure", () => {
    // Third place this shape matters: wrapping the action in a closure swaps the
    // form's endpoint for React's `javascript:` placeholder, and the screen a
    // reader reaches from an email does nothing until its bundle has run.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "reset-password-form.tsx"),
      "utf8",
    );
    expect(source).toContain("action={formAction}");
    expect(source).toContain("] = useActionState(resetPasswordAction,");
    expect(source).not.toContain("authClient.resetPassword");
  });

  it("renders an expired or invalid token recovery in Russian", () => {
    mocks.error = "expired";
    const html = renderToStaticMarkup(<ResetPasswordForm locale="ru" />);

    expect(html).toContain("Эта ссылка для входа неактивна");
    expect(html).toContain("Помощь со входом");
    expect(html).not.toContain("expired");
  });
});
