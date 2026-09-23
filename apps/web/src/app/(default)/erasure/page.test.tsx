import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ERASURE_REQUEST_INTAKE_VERSION,
  formatErasureRequestReference,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000001" },
  })),
  getSessionId: vi.fn(() => "test-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

const localeMocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: localeMocks.getRequestInterfaceLocale,
}));

const repositoryMocks = vi.hoisted(() => ({
  latest: vi.fn(),
}));

vi.mock("@/server/erasure-request-repository", () => ({
  getLatestErasureRequestForUser: (...args: unknown[]) =>
    repositoryMocks.latest(...args),
}));

const DEFAULT_REQUEST = {
  id: "00000000-0000-4000-8000-00000000abcd",
  requesterUserId: "00000000-0000-4000-8000-000000000001",
  requestScope: "account_data_erasure",
  status: "handled",
  submittedAt: new Date("2026-06-27T08:00:00.000Z"),
  handledAt: new Date("2026-06-27T09:00:00.000Z"),
  handledStatus: "needs_identity_verification",
  intakeDisclosureVersion: ERASURE_REQUEST_INTAKE_VERSION,
};

vi.mock("./actions", () => ({
  submitErasureRequestAction: vi.fn(),
}));

describe("/erasure", () => {
  beforeEach(() => {
    localeMocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    repositoryMocks.latest.mockResolvedValue(DEFAULT_REQUEST);
  });

  it("renders a real latest status path without raw private evidence", async () => {
    const { default: ErasureRequestPage, generateMetadata } =
      await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestPage());
    const metadata = await generateMetadata();

    expect(metadata.description).toContain("OverGarden");
    expect(html).toContain('lang="ru"');
    expect(html).toContain("Требуется подтверждение личности");
    expect(html).toContain(ERASURE_REQUEST_INTAKE_VERSION);
    expect(html).toContain(
      formatErasureRequestReference("00000000-0000-4000-8000-00000000abcd"),
    );
    // What the page is for, and that sending deletes nothing, before any
    // status or version (`OVE-505`).
    expect(html).toContain("Сама отправка ничего не удаляет");
    expect(html).not.toMatch(/<h1[^>]*>[^<]*MVP/u);
    expect(html).toContain("данные аккаунта удаляются или обезличиваются");
    expect(html).toContain("только по возможности");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toContain("Local cleanup control");
    expect(html).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(/quarantine\/|raw-token|session-token/i);
    expect(html).not.toMatch(/Needs identity verification|Request status/i);
  });

  /**
   * `OVE-456` AC6. What the screen says is a privacy promise; where it sits is
   * design. This asserts the second without loosening the first: the three
   * questions a reader actually has are headings now, and the eight
   * acknowledgement lines are still all there, unedited and in order.
   */
  it("answers what is deleted, what survives, and how long the address answers", async () => {
    const { default: ErasureRequestPage } = await import("./page");
    const { getTrustSurfaceCopy } = await import("@/lib/trust-surface-copy");
    const copy = getTrustSurfaceCopy("ru").erasure;
    const html = renderToStaticMarkup(await ErasureRequestPage());

    for (const id of [
      "erasure-what-is-deleted",
      "erasure-what-survives",
      "erasure-address-window",
      "erasure-process",
    ]) {
      expect(html, id).toContain(`id="${id}"`);
      expect(html, id).toContain(`aria-labelledby="${id}-heading"`);
    }
    expect(html).toContain(copy.whatIsDeletedTitle);
    expect(html).toContain(copy.whatSurvivesTitle);
    expect(html).toContain(copy.addressWindowTitle);
    expect(html).toContain("Восстановить запись нельзя");
    expect(html).not.toContain("410");

    // The promise set is fixed (ADR-0021, MVP_PRIVACY_RETENTION_POLICY.md).
    // `erasure-schema-coverage.test.ts` exists because the promise and the
    // schema have drifted apart before; this is the other half of that.
    // Scoped to the section that carries the list: one of the lines also
    // appears inside `processDescription` above it, which is the same promise
    // said once in each place and not a second copy of the set.
    const process = html.slice(html.indexOf('id="erasure-process"'));
    let cursor = -1;
    for (const line of copy.acknowledgementLines) {
      const at = process.indexOf(escapeHtml(line));
      expect(at, line).toBeGreaterThan(cursor);
      cursor = at;
    }
  });
});

describe("/erasure, told apart and read back (OVE-505)", () => {
  beforeEach(() => {
    localeMocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    repositoryMocks.latest.mockResolvedValue(DEFAULT_REQUEST);
  });

  async function render(result?: string) {
    const { default: ErasureRequestPage } = await import("./page");
    return renderToStaticMarkup(
      await ErasureRequestPage({
        searchParams: Promise.resolve(result ? { result } : {}),
      }),
    );
  }

  it("tells one entry, the account and outside copies apart before asking", async () => {
    repositoryMocks.latest.mockResolvedValue(null);
    const html = await render();

    expect(html).toContain('id="erasure-choices"');
    expect(html).toContain("Один запис");
    expect(html).toContain("Для цього запит не потрібен");
    expect(html).toContain('href="/garden"');
    expect(html).toContain("Акаунт і все, що з ним пов&#x27;язано");
    expect(html).toContain("Копії поза OverGarden");
    // What is deleted and what survives come before the form.
    expect(html.indexOf('id="erasure-what-survives"')).toBeLessThan(
      html.indexOf('name="erasureAcknowledgementAccepted"'),
    );
    // The legal status and the version close the page; they do not open it.
    expect(html.indexOf('id="erasure-about"')).toBeGreaterThan(
      html.indexOf('id="erasure-process"'),
    );
    expect(html).not.toContain('data-slot="badge"');
  });

  it("puts where a request stands first, with what happens next", async () => {
    repositoryMocks.latest.mockResolvedValue({
      ...DEFAULT_REQUEST,
      status: "reviewing",
      handledAt: null,
      handledStatus: null,
    });
    const html = await render();

    expect(html).toContain('data-erasure-request-status="reviewing"');
    expect(html.indexOf("data-erasure-request-status")).toBeLessThan(
      html.indexOf('id="erasure-choices"'),
    );
    expect(html).toContain("Що далі");
    expect(html).toContain("Команда перевіряє, які дані охопить видалення");
    // An open request offers no second form.
    expect(html).not.toContain('name="erasureAcknowledgementAccepted"');
  });

  it("says how to go on when identity must be confirmed", async () => {
    const html = await render();

    expect(html).toContain("Потрібне підтвердження особи");
    expect(html).toContain("з адреси, прив&#x27;язаної до акаунта");
  });

  it("reads a received request back, with its reference", async () => {
    repositoryMocks.latest.mockResolvedValue({
      ...DEFAULT_REQUEST,
      status: "submitted",
      handledAt: null,
      handledStatus: null,
    });
    const html = await render("received");

    expect(html).toContain('data-action-outcome="received"');
    expect(html).toContain("Запит отримано");
    expect(html).toContain(
      formatErasureRequestReference("00000000-0000-4000-8000-00000000abcd"),
    );
    expect(html).toContain('role="status"');
  });

  it("says a request was not sent when its conditions were not accepted", async () => {
    repositoryMocks.latest.mockResolvedValue(null);
    const html = await render("acknowledgement-required");

    expect(html).toContain('data-action-outcome="acknowledgement-required"');
    expect(html).toContain("Запит не надіслано");
    expect(html).toContain('role="alert"');
  });

  it("ignores an outcome it cannot read", async () => {
    const html = await render("deleted");
    expect(html).not.toContain("data-action-outcome");
  });
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}
