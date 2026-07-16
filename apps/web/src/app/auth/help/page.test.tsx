import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordResetRequestForm } from "@/app/auth/help/password-reset-request-form";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import {
  PILOT_AUTH_HELP_PATH,
  PILOT_AUTH_RESET_PASSWORD_PATH,
} from "@/lib/auth/pilot-auth-recovery";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import AuthHelpPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("/auth/help closed-pilot recovery page copy", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
  });

  it("uses stable auth recovery routes", () => {
    expect(PILOT_AUTH_HELP_PATH).toBe("/auth/help");
    expect(PILOT_AUTH_RESET_PASSWORD_PATH).toBe("/auth/reset-password");
  });

  it("owns recovery guidance in the typed trust namespace", () => {
    const copy = getTrustSurfaceCopy("bg").authHelp;
    expect(copy.description).toContain("еднократни връзки");
    expect(copy.fallbackBody).toContain("оператор");
  });

  it("renders a self-serve password reset request without provider secrets", () => {
    const html = renderToStaticMarkup(<PasswordResetRequestForm locale="bg" />);

    expect(html).toContain("Изпращане на връзка за възстановяване");
    expect(html).toContain("Изпращане на връзка");
    expect(html).not.toContain("RESEND_API_KEY");
    expect(html).not.toContain("re_");
  });

  it("renders the public support email on the account recovery page", async () => {
    const html = renderToStaticMarkup(await AuthHelpPage());
    const metadata = await generateMetadata();

    expect(metadata.title).toBe("Помощ за вход");
    expect(html).toContain('lang="bg"');
    expect(html).toContain("Нуждаете се от помощ за влизане?");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toMatch(/RESEND_API_KEY|raw-token|session-token/i);
  });
});
