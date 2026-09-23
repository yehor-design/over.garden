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

// The signed-out path asks whether the reader arrived with a session cookie
// before deciding that "no session" means "signed out" (`OVE-457`), and that
// question reads the request's own `cookie` header.
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
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

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-00000000abcd",
    requesterUserId: "00000000-0000-4000-8000-000000000001",
    requesterHandle: "anna_gardens",
    requestScope: "account_data_erasure",
    status: "reviewing",
    submittedAt: new Date("2026-06-27T08:00:00.000Z"),
    handledAt: null,
    handledStatus: null,
    intakeDisclosureVersion: ERASURE_REQUEST_INTAKE_VERSION,
    dryRunReviewedAt: new Date("2026-06-29T09:00:00.000Z"),
    dryRunReviewedByUserId: "00000000-0000-4000-8000-000000000999",
    ...overrides,
  };
}

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
    mocks.listOperatorErasureRequests.mockResolvedValue([request()]);
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

  it("reads each request as a task, with its identity, state and next step (OVE-505)", async () => {
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain('data-operator-surface="erasure-requests"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain(
      "Ваш доступ: лише захищений власник з паролем · роль: Власник",
    );
    expect(mocks.listOperatorErasureRequests).toHaveBeenCalledOnce();
    expect(mocks.getErasureDryRunPreviewForRequest).toHaveBeenCalledOnce();
    // Who, by handle — the account id only as a diagnostic.
    expect(html).toContain("@anna_gardens");
    const technical = html.indexOf("Технічні дані");
    expect(
      html.indexOf("00000000-0000-4000-8000-000000000001"),
    ).toBeGreaterThan(technical);
    // The state and the next step, in words.
    expect(html).toContain("Наступний крок");
    expect(html).toContain(
      "Сотріть дані (потрібна фраза підтвердження) або зафіксуйте інший результат.",
    );
    expect(html).toContain("Попередній звіт: що буде стерто");
    expect(html).toContain("Записи журналу");
    expect(html).toContain("Позначити звіт переглянутим ще раз");
    expect(html).toContain("Стерти дані акаунта");
    // The confirmation names what erasing covers, from the preview.
    expect(html).toContain("записи: 2");
    expect(html).toContain("APPROVE request-0000abcd IRREVERSIBLE ERASURE");
    expect(html).toContain("request-0000abcd");
    expect(html).toContain("Зафіксувати результат");
    expect(html).toContain("Потрібне підтвердження особи");
    expect(html).not.toContain('<option value="completed">');
    // No jargon in the main flow; definitions and caveats are a disclosure.
    expect(html.replaceAll(/<details[\s\S]*?<\/details>/g, "")).not.toMatch(
      /dry-run|супроводжувач|\b410\b/i,
    );
    // Icons are inline SVG and carry `xmlns="http://www.w3.org/2000/svg"`,
    // which is markup rather than evidence. The rule is about what the page
    // says, so the namespace is removed before the page is read.
    expect(html.replaceAll(/\sxmlns="[^"]*"/g, "")).not.toMatch(
      /quarantine|derivative|https?:\/\//i,
    );
  });

  it("offers to start a new request, and no erasure yet", async () => {
    mocks.listOperatorErasureRequests.mockResolvedValue([
      request({ status: "submitted", dryRunReviewedAt: null }),
    ]);
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(html).toContain("Почніть розгляд.");
    expect(html).toContain("Почати розгляд");
    expect(html).not.toContain("Стерти дані акаунта");
  });

  it("offers to resume a stalled cleanup, and never a preview for a closed request", async () => {
    mocks.listOperatorErasureRequests.mockResolvedValue([
      request({
        status: "handled",
        handledStatus: "cleanup_pending",
        handledAt: new Date("2026-06-30T09:00:00.000Z"),
        requesterHandle: null,
      }),
      request({
        id: "00000000-0000-4000-8000-00000000beef",
        status: "handled",
        handledStatus: "declined",
        handledAt: new Date("2026-06-30T09:00:00.000Z"),
      }),
    ]);
    const { default: ErasureRequestsOperatorPage } = await import("./page");
    const html = await renderServerHtml(await ErasureRequestsOperatorPage());

    expect(mocks.getErasureDryRunPreviewForRequest).not.toHaveBeenCalled();
    expect(html).toContain('data-erasure-request-state="cleanup_pending"');
    expect(html).toContain("Продовжити очищення");
    expect(html).toContain("уже стерто");
    expect(html).toContain("Нічого робити не треба.");
    expect(html).not.toContain("Зафіксувати результат");
  });

  it.each([
    ["done", "Збережено", "request-0000abcd: На розгляді оператора."],
    ["stale", "Нічого не змінено", "request-0000abcd уже в іншому стані"],
    ["approval", "Нічого не стерто", "Фраза підтвердження не збігається"],
  ] as const)(
    "reads a %s action back from the stored request",
    async (result, title, sentence) => {
      const { default: ErasureRequestsOperatorPage } = await import("./page");
      const html = await renderServerHtml(
        await ErasureRequestsOperatorPage({
          searchParams: Promise.resolve({
            request: "00000000-0000-4000-8000-00000000abcd",
            result,
          }),
        }),
      );

      expect(html).toContain(`data-action-outcome="${result}"`);
      expect(html).toContain(title);
      expect(html).toContain(sentence);
    },
  );

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
