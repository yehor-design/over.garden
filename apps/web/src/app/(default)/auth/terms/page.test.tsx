import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  readLegalAcceptanceState: vi.fn(),
  isDeclinableNewAccount: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/legal-acceptance", () => ({
  readLegalAcceptanceState: mocks.readLegalAcceptanceState,
  isDeclinableNewAccount: mocks.isDeclinableNewAccount,
}));
vi.mock("./actions", () => ({
  acceptLegalDocumentsAction: vi.fn(),
  declineLegalDocumentsAction: vi.fn(),
}));

import LegalAcceptanceRoute from "./page";

async function render(next?: string) {
  return renderToStaticMarkup(
    await LegalAcceptanceRoute({
      searchParams: Promise.resolve(next ? { next } : {}),
    }),
  );
}

describe("/auth/terms (ADR-0038 D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.readLegalAcceptanceState.mockResolvedValue("none");
    mocks.isDeclinableNewAccount.mockResolvedValue(false);
  });

  it("asks once: the points, the three documents, two cookie switches off, and both answers", async () => {
    const html = await render("/garden/spaces/new");
    expect(html).toContain(">Умови використання Overgarden</h1>");
    expect(html).toContain(">Фото ілюструють види<");
    for (const href of [
      'href="/terms"',
      'href="/privacy"',
      'href="/cookies"',
    ]) {
      expect(html).toContain(href);
    }
    // Both switches are off until the reader moves one.
    expect(html.match(/role="switch"/gu)).toHaveLength(2);
    expect(html).not.toMatch(/role="switch"[^>]*checked=""/u);
    expect(html).toContain(">Прийняти</span></button>");
    expect(html).toContain(">Не приймаю</span></button>");
    expect(html).toContain('name="next" value="/garden/spaces/new"');
    expect(html).toContain("Без прийняття ви вийдете з акаунта.");
  });

  it("says a just-created Google account is deleted on decline", async () => {
    mocks.isDeclinableNewAccount.mockResolvedValue(true);
    const html = await render();
    expect(html).toContain(
      "Без прийняття акаунт, щойно створений через Google, буде видалено.",
    );
  });

  it("names a changed version as a change", async () => {
    mocks.readLegalAcceptanceState.mockResolvedValue("outdated");
    const html = await render();
    expect(html).toContain(">Ми оновили умови</h1>");
  });

  it("sends a guest to sign in and back here, and an accepted account onward", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    await expect(render("/garden/new")).rejects.toThrow(
      "redirect:/auth/sign-in?next=%2Fgarden%2Fnew",
    );
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.readLegalAcceptanceState.mockResolvedValue("current");
    await expect(render("/garden/objects/x")).rejects.toThrow(
      "redirect:/garden/objects/x",
    );
  });

  it("never follows a return path off this site", async () => {
    const html = await render("https://evil.example/");
    expect(html).toContain('name="next" value="/garden"');
  });
});
