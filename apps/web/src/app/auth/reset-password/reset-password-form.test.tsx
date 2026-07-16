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

vi.mock("@/lib/auth-client", () => ({
  authClient: { resetPassword: vi.fn() },
}));

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    mocks.token = "opaque-reset-token";
    mocks.error = null;
  });

  it("renders the ready state in the selected locale without exposing the token", () => {
    const html = renderToStaticMarkup(<ResetPasswordForm locale="bg" />);

    expect(html).toContain("Изберете нова парола");
    expect(html).toContain("Потвърждаване на паролата");
    expect(html).toContain("Обновяване на паролата");
    expect(html).not.toContain("opaque-reset-token");
    expect(html).not.toMatch(/Choose a new password|Confirm password/i);
  });

  it("renders an expired or invalid token recovery in Russian", () => {
    mocks.error = "expired";
    const html = renderToStaticMarkup(<ResetPasswordForm locale="ru" />);

    expect(html).toContain("Эта ссылка для входа неактивна");
    expect(html).toContain("Помощь со входом");
    expect(html).not.toContain("expired");
  });
});
