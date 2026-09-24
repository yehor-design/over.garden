// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  GUEST_SITE_SHELL_SESSION_STATE,
  UNREACHABLE_SITE_SHELL_SESSION_STATE,
} from "@/lib/site-shell-session-state";

/**
 * `OVE-457` criterion 8: the chrome stops disagreeing with the page.
 *
 * A workspace page whose session read failed says so — `resolveWorkspaceViewer`
 * has answered `unavailable` since ADR-0023. The shell above it answered
 * "guest" for the same failure and drew "Sign in", so one request produced two
 * statements about the same reader and only one of them was true. This asserts
 * the two now come from one question.
 */
const mocks = vi.hoisted(() => ({ pathname: "/garden" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

describe("the chrome and the page agree about the session", () => {
  it("offers sign-in when the store said nobody is signed in", async () => {
    const { SiteShell } = await import("./site-shell");
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Сад</main>
      </SiteShell>,
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-site-shell-action="sign-in"]'),
      ).not.toBeNull();
    });
    expect(
      document.querySelector('[data-site-shell-session="unreachable"]'),
    ).toBeNull();
  });

  it("says the session could not be checked, and never 'sign in', when the store is unreachable", async () => {
    const { SiteShell } = await import("./site-shell");
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={UNREACHABLE_SITE_SHELL_SESSION_STATE}
      >
        <main>Сад</main>
      </SiteShell>,
    );

    const notice = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        '[data-site-shell-session="unreachable"]',
      );
      if (!found) throw new Error("the shell drew no session notice");
      return found;
    });
    // A status, not an alert: it is a statement about the page a reader is
    // already looking at, not an interruption (DESIGN.md §8).
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("Не вдалося перевірити сесію");
    expect(
      document.querySelector('[data-site-shell-action="sign-in"]'),
    ).toBeNull();
    // And the account menu, which only a signed-in reader has, is not drawn
    // either: "unreachable" is neither of the two answers.
    expect(screen.queryByRole("button", { name: "Акаунт" })).toBeNull();
  });
});
