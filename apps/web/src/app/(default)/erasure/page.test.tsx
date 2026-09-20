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

vi.mock("@/server/erasure-request-repository", () => ({
  getLatestErasureRequestForUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-00000000abcd",
    requesterUserId: "00000000-0000-4000-8000-000000000001",
    requestScope: "account_data_erasure",
    status: "handled",
    submittedAt: new Date("2026-06-27T08:00:00.000Z"),
    handledAt: new Date("2026-06-27T09:00:00.000Z"),
    handledStatus: "needs_identity_verification",
    intakeDisclosureVersion: ERASURE_REQUEST_INTAKE_VERSION,
  })),
}));

vi.mock("./actions", () => ({
  submitErasureRequestAction: vi.fn(),
}));

describe("/erasure", () => {
  beforeEach(() => {
    localeMocks.getRequestInterfaceLocale.mockResolvedValue("ru");
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
    expect(html).toContain("ничего не удаляет автоматически");
    expect(html).toContain("удалить или анонимизировать ссылки");
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
    expect(html).toContain("410");

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}
