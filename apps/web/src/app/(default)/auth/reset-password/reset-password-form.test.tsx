import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResetPasswordForm } from "./reset-password-form";

const idle = async () => ({ status: "idle" as const, message: null });

describe("ResetPasswordForm", () => {
  it("renders the ready state in the selected locale", () => {
    const html = renderToStaticMarkup(
      <ResetPasswordForm locale="bg" token="opaque-reset-token" reset={idle} />,
    );

    expect(html).toContain("Нова парола");
    expect(html).toContain("Потвърждаване на паролата");
    expect(html).toContain("Обновяване на паролата");
    expect(html).not.toMatch(/Choose a new password|Confirm password/i);
    // Both fields are new passwords to a password manager.
    expect(
      html.toLowerCase().match(/autocomplete="new-password"/gu),
    ).toHaveLength(2);
  });

  it("carries the token in the form, and nowhere a reader could hand it on", () => {
    // The token moved out of a closure and into a hidden field when the form
    // became a Server Action (`OVE-455`), because a form is what a browser can
    // submit without JavaScript. That is not new exposure: the reader is
    // already on the address that carries it, and it posts back to the same
    // origin. What must stay true is that it reaches nothing else — no link, no
    // visible text, no other attribute somebody could copy or share.
    const html = renderToStaticMarkup(
      <ResetPasswordForm locale="bg" token="opaque-reset-token" reset={idle} />,
    );
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
    expect(source).toMatch(/<form\s+action=\{formAction\}/u);
    expect(source).toContain("] = useActionState(reset,");
    expect(source).not.toContain("authClient.resetPassword");
  });

  it("keeps both passwords above the boundary a lost request re-mounts", () => {
    // `OVE-504`: two passwords that differ, or a request that never came back,
    // leave what was typed where it was typed.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "reset-password-form.tsx"),
      "utf8",
    );
    const outer = source.slice(
      source.indexOf("export function ResetPasswordForm"),
      source.indexOf("function ResetForm"),
    );
    expect(outer).toContain("useState");
    expect(outer).toContain("<TransportBoundary");
    expect(source).toMatch(/value=\{password\}/u);
    expect(source).toMatch(/value=\{confirmation\}/u);
  });
});
