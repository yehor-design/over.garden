import { renderServerHtml } from "@test/render-server-html";
import { missingRelationRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERASURE_REQUEST_INTAKE_VERSION } from "@/lib/privacy/disclosures";
import { AdminAccessDeniedError } from "@/server/admin-access";

const mocks = vi.hoisted(() => ({
  assertAdminCapabilityForScope: vi.fn(),
  getCurrentSession: vi.fn(),
  listOperatorErasureRequests: vi.fn(),
  getErasureDryRunPreviewForRequest: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "operator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: vi.fn(async () => "uk"),
}));

vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));

vi.mock("@/server/erasure-request-repository", () => ({
  listOperatorErasureRequests: mocks.listOperatorErasureRequests,
}));

vi.mock("@/server/erasure-dry-run-repository", () => ({
  getErasureDryRunPreviewForRequest: mocks.getErasureDryRunPreviewForRequest,
}));

vi.mock("@/server/erasure-execution", () => ({
  expectedErasureMaintainerApprovalText: () =>
    "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
}));

vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
    </section>
  ),
}));

vi.mock("./actions", () => ({
  executeApprovedErasureRequestAction: vi.fn(),
  markErasureRequestHandledAction: vi.fn(),
  markErasureRequestReviewingAction: vi.fn(),
  markErasureRequestDryRunReviewedAction: vi.fn(),
}));

describe("/garden/privacy/erasure-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000999" },
    });
    mocks.assertAdminCapabilityForScope.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.listOperatorErasureRequests.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-00000000abcd",
        requesterUserId: "00000000-0000-4000-8000-000000000001",
        requestScope: "account_data_erasure",
        status: "reviewing",
        submittedAt: new Date("2026-06-27T08:00:00.000Z"),
        handledAt: null,
        handledStatus: null,
        intakeDisclosureVersion: ERASURE_REQUEST_INTAKE_VERSION,
        dryRunReviewedAt: new Date("2026-06-29T09:00:00.000Z"),
        dryRunReviewedByUserId: "00000000-0000-4000-8000-000000000999",
      },
    ]);
    mocks.getErasureDryRunPreviewForRequest.mockResolvedValue({
      requestId: "00000000-0000-4000-8000-00000000abcd",
      requesterUserId: "00000000-0000-4000-8000-000000000001",
      generatedAt: new Date("2026-06-29T08:00:00.000Z"),
      dataClasses: [
        {
          key: "journal_entries",
          label: "Journal entries",
          description: "Private and public entry rows grouped by lifecycle.",
          counts: {
            total: 2,
            public_active: 1,
            archived: 0,
          },
        },
      ],
      caveats: ["This preview is non-destructive and repeatable."],
    });
  });

  it("renders the structural sign-in boundary without reading requests", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-operator-surface="erasure-requests"');
    expect(html).toContain('data-operator-access-state="sign-in-required"');
    expect(mocks.listOperatorErasureRequests).not.toHaveBeenCalled();
  });

  it("does not read erasure requests for a signed-in non-operator", async () => {
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new AdminAccessDeniedError(),
    );

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-operator-surface="erasure-requests"');
    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).toContain("Доступ заборонено.");
    expect(mocks.listOperatorErasureRequests).not.toHaveBeenCalled();
    expect(mocks.getErasureDryRunPreviewForRequest).not.toHaveBeenCalled();
  });

  it("renders dry-run preview counts without private journal evidence", async () => {
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-operator-surface="erasure-requests"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain("Режим доступу: лише захищений власник з паролем");
    expect(html).toContain("Роль: Власник");
    expect(mocks.listOperatorErasureRequests).toHaveBeenCalledOnce();
    expect(mocks.getErasureDryRunPreviewForRequest).toHaveBeenCalledOnce();
    expect(html).toContain("Недеструктивний dry-run-перегляд");
    expect(html).toContain("Записи журналу");
    expect(html).toContain("Зафіксувати dry-run повторно");
    expect(html).toContain("Незворотне видалення, схвалене супроводжувачем");
    expect(html).toContain("Виконати схвалене видалення");
    expect(html).toContain("APPROVE request-0000abcd IRREVERSIBLE ERASURE");
    expect(html).toContain("request-0000abcd");
    expect(html).toContain("Позначити опрацьованим");
    expect(html).toContain("Потрібне підтвердження особи");
    expect(html).not.toContain('<option value="completed">');
    expect(html).not.toMatch(/quarantine|derivative|https?:\/\//i);
  });

  it("renders its own shell and a bounded failure when the relation is missing", async () => {
    mocks.listOperatorErasureRequests.mockRejectedValue(
      missingRelationRejection("erasure_requests"),
    );

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-workspace-surface="erasure-requests"');
    expect(html).toContain('data-section-failure="schema_missing"');
    // Owner-only surface: naming the relation is the difference between a
    // five-minute migration and a hunt.
    expect(html).toContain("erasure_requests");
    expect(html).toContain("docs/MIGRATION_ALLOCATION.md");
    expect(html).not.toContain('data-workspace-state="loading"');
  });

  it("says the role table is unreachable instead of reporting a denial", async () => {
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      Object.assign(new Error("redacted driver failure"), {
        code: "ECONNREFUSED",
      }),
    );

    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-operator-access-state="unavailable"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(mocks.listOperatorErasureRequests).not.toHaveBeenCalled();
  });
});
