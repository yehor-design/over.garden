import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordResetRequestForm } from "@/app/(default)/auth/help/password-reset-request-form";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import {
  AUTH_HELP_PATH,
  AUTH_RESET_PASSWORD_PATH,
} from "@/lib/auth/auth-recovery";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("../auth-actions", () => ({
  requestPasswordResetAction: async () => ({ status: "idle", message: null }),
}));

const idle = async () => ({ status: "idle" as const, message: null });

async function renderPage(params: Record<string, string> = {}) {
  const { default: AuthHelpPage } = await import("./page");
  return renderToStaticMarkup(
    await AuthHelpPage({ searchParams: Promise.resolve(params) }),
  );
}

describe("/auth/help self-serve recovery page", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
  });

  it("uses stable auth recovery routes", () => {
    expect(AUTH_HELP_PATH).toBe("/auth/help");
    expect(AUTH_RESET_PASSWORD_PATH).toBe("/auth/reset-password");
  });

  it("owns recovery guidance in the typed trust namespace", () => {
    const copy = getTrustSurfaceCopy("bg").authHelp;
    expect(copy.description).toContain("еднократни връзки");
    expect(copy.fallbackBody).toContain("поддръжката");
    expect(copy.fallbackBody).not.toContain("само с покани");
  });

  it("renders a self-serve password reset request without provider secrets", () => {
    const html = renderToStaticMarkup(
      <PasswordResetRequestForm locale="bg" request={idle} />,
    );

    expect(html).toContain("Изпращане на връзка");
    expect(html).toContain('data-password-reset-request="true"');
    expect(html).not.toContain("RESEND_API_KEY");
    expect(html).not.toContain("re_");
  });

  it("asks for the link through a real endpoint, not the auth client (OVE-504)", () => {
    // It was a `type="button"` calling `authClient.requestPasswordReset`, so it
    // did nothing until the bundle had run (ADR-0024 D3).
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "password-reset-request-form.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("] = useActionState(request,");
    expect(source).toMatch(/<form\s+action=\{formAction\}/u);
    expect(source).not.toContain("authClient.");
    expect(source).toContain('type="submit"');
  });

  it("renders the one focused column, the support email, and a way back that keeps `next`", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata();
    const html = await renderPage({ next: "/communities/tomatoes" });

    expect(metadata.title).toBe("Помощ за вход");
    expect(html).toContain('data-auth-frame="help"');
    expect(html).toContain('lang="bg"');
    expect(html).toMatch(/<h1[^>]*>Помощ за вход<\/h1>/u);
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(
      'href="/auth/sign-in?next=%2Fcommunities%2Ftomatoes"',
    );
    // Three answerable questions, each with its own heading.
    expect(html.match(/<h2[^>]*>/gu)).toHaveLength(3);
    expect(html).not.toMatch(/RESEND_API_KEY|raw-token|session-token/i);
  });

  it("never carries an off-origin `next` back to sign-in", async () => {
    const html = await renderPage({ next: "https://attacker.example/steal" });

    expect(html).not.toContain("attacker.example");
    expect(html).toContain('href="/auth/sign-in"');
  });
});
