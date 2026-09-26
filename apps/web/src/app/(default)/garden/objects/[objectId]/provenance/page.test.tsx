import { renderServerHtml } from "@test/render-server-html";
import { missingRelationRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn(),
  getPlantObjectPage: vi.fn(),
  getObjectProvenancePanel: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));
vi.mock("@/server/journal-repository", () => ({
  getPlantObjectPage: mocks.getPlantObjectPage,
}));
vi.mock("@/server/lineage-repository", () => ({
  getObjectProvenancePanel: mocks.getObjectProvenancePanel,
}));
vi.mock("@/server/author-handle-repository", () => ({
  getPublicAuthorHandle: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: () => false,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
    </section>
  ),
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OBJECT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TOMATO = "10000000-0000-4000-8000-000000000002";

async function renderProvenance(objectId = OBJECT_ID) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ params: Promise.resolve({ objectId }) }),
  );
}

describe("/garden/objects/[objectId]/provenance (OVE-491)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: USER_ID, email: "gardener@example.com" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.scopedToUser.mockImplementation(
      (userId: string, sessionId: string | null) => ({ userId, sessionId }),
    );
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [],
      edges: [],
    });
    mocks.getPlantObjectPage.mockResolvedValue(objectPage());
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it.each([
    [
      "uk",
      "Походження об&#x27;єкта",
      "Походить від Maria&#x27;s saved seeds · Пакет насіння",
    ],
    [
      "bg",
      "Произход на обекта",
      "Произхожда от Maria&#x27;s saved seeds · Пакет семена",
    ],
    [
      "ru",
      "Происхождение объекта",
      "Происходит от Maria&#x27;s saved seeds · Пакет семян",
    ],
  ] as const)(
    "reads the records first, then offers the ways to add one, in %s",
    async (locale, title, edgeLabel) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      mocks.getObjectProvenancePanel.mockResolvedValue({
        sourceObjectOptions: [],
        edges: [referenceEdge({ label: "Maria's saved seeds" })],
      });

      const html = await renderProvenance();

      expect(html).toContain('data-workspace-surface="object-provenance"');
      expect(html.match(/<h1\b/gu)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`, "u"));
      expect(html).toContain(edgeLabel);
      expect(html).toMatch(
        /aria-current="page" data-object-section="provenance"/u,
      );
      // What is recorded precedes the forms.
      expect(html.indexOf('id="passport-provenance"')).toBeLessThan(
        html.indexOf('id="passport-provenance-add"'),
      );
      expect(html).not.toMatch(/>Provenance<|>Record private source</u);
      expect(html).not.toMatch(/owner_user_id|latitude|longitude/iu);
    },
  );

  it("offers only objects of the same kind, and chooses none of them", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [
        {
          id: OTHER_TOMATO,
          displayName: "Томат з минулого року",
          objectKind: "plant",
          catalogKind: null,
          varietyText: "Cherry tomato",
          varietyState: "free_text",
        },
      ],
      edges: [],
    });

    const html = await renderProvenance();

    const select = html.slice(
      html.indexOf('data-provenance-source-select="true"'),
      html.indexOf("</select>"),
    );
    expect(select).toMatch(
      /<option value="" selected="">Оберіть об&#x27;єкт-джерело<\/option>/u,
    );
    expect(select).toContain(
      `<option value="${OTHER_TOMATO}">Томат з минулого року · Рослина · Cherry tomato</option>`,
    );
    expect(html).toContain(
      "Лише рослини з вашого саду: рослина не походить від тварини.",
    );
    // Nothing is recorded until something is chosen.
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*disabled=""[^>]*data-provenance-source-submit="true"/u,
    );
  });

  it("says an animal has no other animal to come from, in words", async () => {
    const page = objectPage();
    page.plantObject.object_kind = "animal";
    page.plantObject.display_name = "Вулик 1";
    mocks.getPlantObjectPage.mockResolvedValue(page);

    const html = await renderProvenance();

    expect(html).toContain("Тварина · Balcony");
    expect(html).toContain(
      "У вашому саду ще немає іншої тварини, від якої могла б походити ця.",
    );
    expect(html).not.toContain("data-provenance-source-select");
  });

  it("renders the current structured person mention without rewriting a stored label", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [],
      edges: [referenceEdge({ kind: "person", mention: "@renamed_gardener" })],
    });

    const html = await renderProvenance();

    expect(html).toContain("@renamed_gardener");
    expect(html).not.toMatch(/source_owner_user_id|owner_user_id|email/iu);
  });

  it("fails a person reference closed to the generic private source when no safe identity resolves", async () => {
    mocks.getObjectProvenancePanel.mockResolvedValue({
      sourceObjectOptions: [],
      edges: [referenceEdge({ kind: "person" })],
    });

    const html = await renderProvenance();

    expect(html).toContain("приватне джерело");
    expect(html).not.toMatch(/@renamed_gardener|source_owner_user_id/iu);
  });

  it("answers a missing or malformed object with the missing record", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(null);
    const missing = await renderProvenance();
    expect(missing).toContain('data-workspace-record="missing"');
    expect(missing).toContain('data-workspace-surface="object-provenance"');

    mocks.getPlantObjectPage.mockClear();
    const malformed = await renderProvenance("object-1");
    expect(malformed).toContain('data-workspace-record="missing"');
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
  });

  it("renders its own shell and a bounded failure when a read fails", async () => {
    mocks.getObjectProvenancePanel.mockRejectedValue(
      missingRelationRejection("lineage_provenance_edges"),
    );

    const html = await renderProvenance();

    expect(html).toContain('data-workspace-surface="object-provenance"');
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("lineage_provenance_edges");
    expect(html).not.toContain('data-workspace-state="loading"');
  });

  it("asks a guest to sign in and reads nothing", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderProvenance();

    expect(html).toContain(
      `data-next="/garden/objects/${OBJECT_ID}/provenance"`,
    );
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
  });
});

function referenceEdge({
  kind = "seed_packet",
  label = null,
  mention = null,
}: {
  kind?: string;
  label?: string | null;
  mention?: string | null;
}) {
  return {
    id: "edge-1",
    sourceKind: "source_reference",
    consentState: "confirmed",
    visibilityPolicy: "owner_only_until_confirmed",
    erasureState: "active",
    sourceObject: null,
    pendingIdentity: null,
    sourceReferenceKind: kind,
    sourceReferenceLabel: label,
    sourcePersonMention: mention,
    createdAt: "2026-07-04T12:00:00.000Z",
  };
}

function objectPage() {
  return {
    space: {
      id: "space-1",
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    plantObject: {
      id: OBJECT_ID,
      display_name: "Cherry tomato",
      object_kind: "plant" as string,
      catalogKind: "plant_variety",
      catalog_item_id: null,
      catalog_canonical_name: null,
      catalog_public_slug: null,
      public_slug: null,
      variety_text: "Cherry tomato",
      variety_state: "selected",
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: null,
    },
    entries: [],
    gallery_media: [],
  };
}
