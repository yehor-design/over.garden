import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  prepareSession: vi.fn(),
  confirmSession: vi.fn(),
  fetchBinding: vi.fn(),
  erase: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: mocks.getSession },
}));
vi.mock("@/lib/auth/sign-out-contract", () => ({
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS: {
    query: { disableCookieCache: true },
    fetchOptions: { cache: "no-store" },
  },
  prepareCurrentSessionSignOut: mocks.prepareSession,
  confirmPreparedCurrentSession: mocks.confirmSession,
}));
vi.mock("@/lib/offline/owner-vault", () => ({
  fetchAuthenticatedOwnerVaultBinding: mocks.fetchBinding,
}));
vi.mock("@/lib/offline/owner-session-lifecycle", () => ({
  eraseCurrentDeviceOwnerOfflineStore: mocks.erase,
}));

import { ErasureLocalCleanup } from "./erasure-local-cleanup";

const OWNER = "00000000-0000-4000-8000-0000000000a1";

describe("current-device erasure control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { user: { id: OWNER } } });
    mocks.prepareSession.mockResolvedValue({
      version: 1,
      binding: "G".repeat(43),
    });
    mocks.fetchBinding.mockResolvedValue("B".repeat(43));
    mocks.confirmSession.mockResolvedValue({ status: "matches" });
    mocks.erase.mockResolvedValue({
      status: "erased_confirmed",
      counts: {},
      digest: "0".repeat(64),
      durationMs: 10,
    });
  });

  it.each(["uk", "bg", "ru"] as const)(
    "names the destructive scope as this device only in %s",
    (locale) => {
      const html = renderToStaticMarkup(
        <ErasureLocalCleanup locale={locale} />,
      );

      expect(html).toContain('data-erasure-local-cleanup="true"');
      expect(html).toMatch(/пристро|устройств/i);
      expect(html).toMatch(/брауз/i);
      expect(html).not.toContain(OWNER);
    },
  );

  it("requires a second explicit action and confirms only the proved receipt", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ErasureLocalCleanup locale="uk" />);
    });
    act(() => renderer!.root.findAllByType("button")[0]?.props.onClick());
    expect(mocks.erase).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.root.findAllByType("button")[0]?.props.onClick();
    });

    expect(mocks.fetchBinding).toHaveBeenCalledWith("G".repeat(43));
    expect(mocks.confirmSession).toHaveBeenCalledWith({
      version: 1,
      binding: "G".repeat(43),
    });
    expect(mocks.erase).toHaveBeenCalledWith(OWNER, "B".repeat(43));
    expect(JSON.stringify(renderer!.toJSON())).toContain("Підтверджено");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain(OWNER);
  });

  it("never presents confirmation for an unproved deletion", async () => {
    mocks.erase.mockResolvedValueOnce({
      status: "erasure_unconfirmed",
      durationMs: 3_000,
    });
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ErasureLocalCleanup locale="ru" />);
    });
    act(() => renderer!.root.findAllByType("button")[0]?.props.onClick());
    await act(async () => {
      renderer!.root.findAllByType("button")[0]?.props.onClick();
    });

    const output = JSON.stringify(renderer!.toJSON());
    expect(output).toContain("Не удалось подтвердить");
    expect(output).not.toContain("Подтверждено:");
    expect(output).toContain("Повторить проверенную очистку");

    act(() => renderer!.root.findAllByType("button")[0]?.props.onClick());
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Подтвердить очистку этого устройства",
    );
    expect(mocks.erase).toHaveBeenCalledOnce();
  });
});
