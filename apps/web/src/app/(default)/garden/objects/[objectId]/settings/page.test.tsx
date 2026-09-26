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
vi.mock("../catalog-resolve-control", () => ({
  CatalogResolveControl: (props: { currentVarietyText: string | null }) => (
    <section data-catalog-resolve="true">
      Catalog resolve: {props.currentVarietyText}
    </section>
  ),
}));
vi.mock("../location-privacy-control", () => ({
  LocationPrivacyControl: () => <section>Location privacy</section>,
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OBJECT_ID = "10000000-0000-4000-8000-000000000001";

async function renderSettings(objectId = OBJECT_ID) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ params: Promise.resolve({ objectId }) }),
  );
}

describe("/garden/objects/[objectId]/settings (OVE-491)", () => {
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
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it("holds the object's rare settings under one page heading, apart from its history", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(
      objectPage({ varietyState: "free_text", varietyText: "Черрі з ринку" }),
    );

    const html = await renderSettings();

    expect(html).toContain('data-workspace-surface="object-settings"');
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Налаштування об&#x27;єкта<\/h1>/u);
    expect(html).toMatch(/<h2[^>]*>Cherry tomato<\/h2>/u);
    // Who the page is about: the garden, the space, the object.
    expect(html).toMatch(/<a[^>]*href="\/garden"[^>]*>Мій сад<\/a>/u);
    expect(html).toMatch(
      /<a[^>]*href="\/garden\/spaces\/space-1"[^>]*>Balcony<\/a>/u,
    );
    expect(html).toContain("Рослина · Balcony · Черрі з ринку");
    expect(html).toMatch(/aria-current="page" data-object-section="settings"/u);
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/garden/objects/${OBJECT_ID}"[^>]*>До історії об&#x27;єкта</a>`,
        "u",
      ),
    );
    for (const id of [
      "passport-management",
      "passport-privacy",
      "passport-catalog",
    ])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Location privacy");
    expect(html).toContain("Catalog resolve: Черрі з ринку");
    // Writing and reading stay on the history page.
    expect(html).not.toContain("follow-up-composer");
    expect(html).not.toContain("passport-timeline");
  });

  it("says what a matched object is matched to, with nothing to change", async () => {
    const page = objectPage({
      varietyState: "selected",
      varietyText: "Solanum lycopersicum",
    });
    page.plantObject.catalog_canonical_name = "Solanum lycopersicum";
    page.plantObject.catalog_public_slug = "solanum-lycopersicum";
    page.plantObject.catalogKind = "species";
    mocks.getPlantObjectPage.mockResolvedValue(page);

    const html = await renderSettings();

    expect(html).toContain('data-catalog-match="fixed"');
    expect(html).toContain(
      "Об&#x27;єкт зіставлено з каталогом: «Solanum lycopersicum».",
    );
    expect(html).toMatch(
      /<a[^>]*href="\/species\/solanum-lycopersicum"[^>]*>Solanum lycopersicum у каталозі<\/a>/u,
    );
    expect(html).not.toContain("Catalog resolve");
  });

  it.each([
    [
      "uk",
      "Джерело: EU Official Journal / EUR-Lex Common Catalogue. Нормалізовано OverGarden.",
      "Відкрити джерело",
    ],
    [
      "bg",
      "Източник: EU Official Journal / EUR-Lex Common Catalogue. Нормализирано от OverGarden.",
      "Отваряне на източника",
    ],
    [
      "ru",
      "Источник: EU Official Journal / EUR-Lex Common Catalogue. Нормализовано OverGarden.",
      "Открыть источник",
    ],
  ] as const)(
    "credits the data source in %s without translating its name",
    async (locale, sourceSummary, openSource) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const page = objectPage({ varietyState: "selected" });
      page.plantObject.source_credit = {
        sourceSlug: "eu_oj_eur_lex_common_catalogue",
        sourceName: "EU Official Journal / EUR-Lex Common Catalogue",
        sourceUrl: "https://eur-lex.europa.eu/",
        attributionText: null,
      };
      mocks.getPlantObjectPage.mockResolvedValue(page);

      const html = await renderSettings();

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(sourceSummary);
      expect(html).toContain(openSource);
      expect(html).toContain("EU Plant Variety Portal");
      expect(html).not.toMatch(/>Open source<|owner_user_id/u);
    },
  );

  it("labels an animal as an animal", async () => {
    const page = objectPage({ varietyState: "unknown", varietyText: null });
    page.plantObject.object_kind = "animal";
    page.plantObject.display_name = "Вулик 1";
    mocks.getPlantObjectPage.mockResolvedValue(page);

    const html = await renderSettings();

    expect(html).toContain("Тварина · Balcony");
    expect(html).not.toContain("Рослина");
  });

  it("answers a missing or malformed object with the missing record", async () => {
    mocks.getPlantObjectPage.mockResolvedValue(null);
    const missing = await renderSettings();
    expect(missing).toContain('data-workspace-record="missing"');
    expect(missing).toContain('data-workspace-surface="object-settings"');

    mocks.getPlantObjectPage.mockClear();
    const malformed = await renderSettings("object-1");
    expect(malformed).toContain('data-workspace-record="missing"');
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
  });

  it("renders its own shell and a bounded failure when a read fails", async () => {
    mocks.getPlantObjectPage.mockRejectedValue(
      missingRelationRejection("plant_objects"),
    );

    const html = await renderSettings();

    expect(html).toContain('data-workspace-surface="object-settings"');
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain("plant_objects");
    expect(html).not.toContain('data-workspace-state="loading"');
  });

  it("asks a guest to sign in and reads nothing", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const html = await renderSettings();

    expect(html).toContain(`data-next="/garden/objects/${OBJECT_ID}/settings"`);
    expect(mocks.getPlantObjectPage).not.toHaveBeenCalled();
  });
});

function objectPage({
  varietyState,
  varietyText = "Cherry tomato",
}: {
  varietyState: string;
  varietyText?: string | null;
}) {
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
      catalogKind: "plant_variety" as string,
      catalog_item_id: null,
      catalog_canonical_name: null as string | null,
      catalog_public_slug: null as string | null,
      catalog_species_slug: null,
      variety_text: varietyText,
      variety_state: varietyState,
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: null as null | {
        sourceSlug: string;
        sourceName: string;
        sourceUrl: string;
        attributionText: string | null;
      },
    },
    entries: [],
    gallery_media: [],
  };
}
