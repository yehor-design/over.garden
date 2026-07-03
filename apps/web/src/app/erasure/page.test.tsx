import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
  it("renders a real latest status path without raw private evidence", async () => {
    const { default: ErasureRequestPage, metadata } = await import("./page");
    const html = renderToStaticMarkup(await ErasureRequestPage());

    expect(metadata.description).toContain(
      "OverGarden MVP account erasure",
    );
    expect(html).toContain("Needs identity verification");
    expect(html).toContain(ERASURE_REQUEST_INTAKE_VERSION);
    expect(html).toContain(
      formatErasureRequestReference("00000000-0000-4000-8000-00000000abcd"),
    );
    expect(html).toContain("does not automatically delete");
    expect(html).toContain("deletes or anonymizes current-schema account");
    expect(html).toContain("removal best-effort only");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(/quarantine\/|raw-token|session-token/i);
  });
});
