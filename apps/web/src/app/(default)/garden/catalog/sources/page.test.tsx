import { postgresRejection } from "@test/postgres-rejection";
import { renderServerHtml } from "@test/render-server-html";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import type {
  CatalogSourceCoverage,
  CatalogSourceSummary,
  CurationQueueItemSummary,
} from "@/server/catalog-curation-repository";
import type {
  CatalogPickHealthRow,
  CatalogSearchMissRow,
} from "@/server/catalog-health-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const SNAPSHOT_EPPO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SNAPSHOT_WFO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUEUE_ITEM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const OWNER_SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const OWNER_ACCESS = {
  mode: "sealed_owner_credential_only",
  role: "owner",
  capabilities: [
    "admin:read",
    "operator:read",
    "operator:mutate",
    "erasure:execute",
  ],
} as const;

const uk = getOperatorCatalogCopy("uk");

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  listCatalogSources: vi.fn(),
  readCatalogSourceCoverage: vi.fn(),
  readCurationQueueItemSummary: vi.fn(),
  readCatalogPickHealth: vi.fn(),
  readTopCatalogSearchMisses: vi.fn(),
  readCatalogAutoAcceptPrecision: vi.fn(),
  readUnplacedRecords: vi.fn(),
}));

// Nothing here may open a pool: every read is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/catalog-curation-repository")
  >()),
  listCatalogSources: mocks.listCatalogSources,
  readCatalogSourceCoverage: mocks.readCatalogSourceCoverage,
  readCurationQueueItemSummary: mocks.readCurationQueueItemSummary,
}));
vi.mock("@/server/catalog-health-repository", () => ({
  readCatalogPickHealth: mocks.readCatalogPickHealth,
  readTopCatalogSearchMisses: mocks.readTopCatalogSearchMisses,
  readCatalogAutoAcceptPrecision: mocks.readCatalogAutoAcceptPrecision,
  readUnplacedRecords: mocks.readUnplacedRecords,
}));
vi.mock("./actions", () => ({
  refreshCatalogSourceAction: vi.fn(),
  makeQueueItemFromMissAction: vi.fn(),
}));

const EPPO: CatalogSourceSummary = {
  sourceSlug: "eppo",
  sourceName: "EPPO Global Database",
  sourceVersion: "2026-09",
  sourceUrl: "https://gd.eppo.int/",
  license: "EPPO terms",
  licenseUrl: null,
  attributionText: "Source: EPPO Global Database",
  snapshotId: SNAPSHOT_EPPO,
  fetchedAt: new Date("2026-09-01T09:00:00.000Z"),
  verifiedAt: new Date("2026-09-02T09:00:00.000Z"),
  rejectedAfterAt: null,
  refresh: null,
};

const WFO: CatalogSourceSummary = {
  sourceSlug: "world-flora-online",
  sourceName: "World Flora Online",
  sourceVersion: "2025-12",
  sourceUrl: "https://www.worldfloraonline.org/",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attributionText: null,
  snapshotId: SNAPSHOT_WFO,
  fetchedAt: new Date("2026-08-20T09:00:00.000Z"),
  verifiedAt: new Date("2026-08-21T09:00:00.000Z"),
  rejectedAfterAt: null,
  refresh: null,
};

const COVERAGE: Record<string, CatalogSourceCoverage> = {
  [SNAPSHOT_EPPO]: {
    recordCount: 800,
    linkedCount: 600,
    identifierCount: 550,
    assertionCount: 700,
  },
  [SNAPSHOT_WFO]: {
    recordCount: 400,
    linkedCount: 300,
    identifierCount: 250,
    assertionCount: 380,
  },
};

const MISS: CatalogSearchMissRow = {
  queryNormalized: "помідор де барао",
  locale: "uk",
  objectKind: "plant",
  occurrences: 9,
  firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-09-06T00:00:00.000Z"),
};

function healthRow(
  windowDays: 7 | 30,
  overrides: Partial<CatalogPickHealthRow> = {},
): CatalogPickHealthRow {
  return {
    windowDays,
    windowStart: new Date(
      windowDays === 7
        ? "2026-09-16T09:00:00.000Z"
        : "2026-08-24T09:00:00.000Z",
    ),
    windowEnd: new Date("2026-09-23T09:00:00.000Z"),
    attempts: 0,
    picked: 0,
    ownLabel: 0,
    abandoned: 0,
    timedPicks: 0,
    medianMsToPick: null,
    p95MsToPick: null,
    ...overrides,
  };
}

function queuedSummary(): CurationQueueItemSummary {
  return {
    id: QUEUE_ITEM,
    itemType: "label_link",
    state: "open",
    subjectLabel: "помідор де барао",
    subjectCatalogItemId: null,
    subjectName: null,
    targetName: null,
    decidedByUserId: null,
    decidedAt: null,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ searchParams: Promise.resolve(searchParams) }),
  );
}

/** Text as React writes it into markup: an apostrophe is `&#x27;`. */
function markup(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** The opening tag of the first element that carries `attribute`. */
function openingTag(html: string, attribute: string): string {
  const at = html.indexOf(attribute);
  if (at < 0) throw new Error(`nothing carries ${attribute}`);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The form a control sits in, or null when it is not inside one. */
function formAround(html: string, attribute: string): string | null {
  const at = html.indexOf(attribute);
  if (at < 0) return null;
  const start = html.lastIndexOf("<form", at);
  if (start < 0 || html.lastIndexOf("</form>", at) > start) return null;
  return html.slice(start, html.indexOf("</form>", at) + "</form>".length);
}

/** One table row, from its `<tr` to its `</tr>`. */
function rowWith(html: string, attribute: string): string {
  const at = html.indexOf(attribute);
  if (at < 0) throw new Error(`no row carries ${attribute}`);
  const start = html.lastIndexOf("<tr", at);
  return html.slice(start, html.indexOf("</tr>", at) + "</tr>".length);
}

function firstTag(fragment: string): string {
  return fragment.slice(0, fragment.indexOf(">") + 1);
}

/** The notice an outcome renders, and the tone of the callout inside it. */
function notice(html: string, outcome: string) {
  const at = html.indexOf(`data-action-outcome="${outcome}"`);
  if (at < 0) return null;
  const fragment = html.slice(at, html.indexOf("</p>", at));
  return {
    tone: /data-tone="(\w+)"/u.exec(fragment)?.[1] ?? null,
    title: fragment.slice(fragment.lastIndexOf(">") + 1),
  };
}

/** The heading of the one failure panel on the page. */
function errorTitle(html: string): string {
  const at = html.indexOf('data-slot="error-state"');
  if (at < 0) throw new Error("no failure is on the page");
  const fragment = html.slice(at, html.indexOf("</h2>", at));
  return fragment.slice(fragment.lastIndexOf(">") + 1);
}

/** Every pick-time figure, in table order: which, its status, window, text. */
function figures(html: string) {
  return [
    ...html.matchAll(
      /data-catalog-health-figure="(median|p95)" data-catalog-health-figure-status="(\w+)" data-catalog-health-window="(\d+)"[^>]*>([^<]*)</gu,
    ),
  ].map((match) => match.slice(1));
}

describe("the catalogue's sources and its own numbers (ADR-0026 D10, D12, OVE-506)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: OWNER_SCOPE.userId,
      scope: OWNER_SCOPE,
    });
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      async (load: () => Promise<unknown>) => ({
        status: "allowed",
        access: await load(),
      }),
    );
    mocks.assertAdminCapabilityForScope.mockResolvedValue(OWNER_ACCESS);
    mocks.listCatalogSources.mockResolvedValue([EPPO, WFO]);
    mocks.readCatalogSourceCoverage.mockImplementation(
      async (snapshotId: string) => COVERAGE[snapshotId],
    );
    mocks.readCurationQueueItemSummary.mockResolvedValue(null);
    mocks.readCatalogPickHealth.mockResolvedValue([
      healthRow(7),
      healthRow(30),
    ]);
    mocks.readTopCatalogSearchMisses.mockResolvedValue([]);
    mocks.readCatalogAutoAcceptPrecision.mockResolvedValue([]);
    mocks.readUnplacedRecords.mockResolvedValue([]);
  });

  it("lists each source with its version, licence, freshness, counts and a refresh button", async () => {
    const html = await render();

    expect(html).toContain('data-operator-surface="catalog-sources"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
      OWNER_SCOPE,
      "operator:read",
    );
    expect(openingTag(html, "data-operator-cross-link=")).toContain(
      'href="/garden/catalog/queue"',
    );
    expect(html).toContain(">Джерела каталогу за назвою</caption>");

    const eppo = rowWith(html, 'data-catalog-source="eppo"');
    expect(firstTag(eppo)).toContain('id="source-eppo"');
    expect(eppo).toContain('href="https://gd.eppo.int/"');
    expect(eppo).toContain("EPPO Global Database");
    expect(eppo).toContain(">eppo</code>");
    expect(eppo).toContain("Версія 2026-09 · Ліцензія: EPPO terms");
    expect(eppo).toContain("Зазначення джерела: Source: EPPO Global Database");
    expect(eppo).toContain("Знімок від 1 вер. 2026 р.");
    expect(eppo).toContain("перевірено 2 вер. 2026 р.");
    expect(eppo).toContain('data-catalog-source-refresh-status="none"');
    expect(eppo).toContain("Звідси ще не оновлювали.");
    expect(eppo).not.toContain("data-catalog-source-cadence");
    const coverage = openingTag(eppo, "data-catalog-source-coverage=");
    expect(coverage).toContain('data-catalog-source-coverage="ready"');
    expect(coverage).toContain('data-catalog-source-records="800"');
    expect(coverage).toContain('data-catalog-source-linked="600"');
    // How many records, on a line of its own; then how many reached a card,
    // in plain numbers, only because there are records to count.
    const records = eppo.indexOf(">800 записів</span>");
    const linked = eppo.indexOf(
      `>${markup("Прив'язано до карток: 600 з 800 (75%)")}</span>`,
    );
    expect(records).toBeGreaterThan(-1);
    expect(linked).toBeGreaterThan(records);
    expect(eppo).toContain("550 ідентифікаторів · 700 тверджень");
    expect(formAround(eppo, 'data-catalog-source-refresh="eppo"')).toContain(
      'name="sourceSlug" value="eppo"',
    );
    expect(openingTag(eppo, "data-catalog-source-refresh=")).toContain(
      'aria-label="Оновити: EPPO Global Database"',
    );

    const wfo = rowWith(html, 'data-catalog-source="world-flora-online"');
    expect(firstTag(wfo)).toContain('id="source-world-flora-online"');
    expect(wfo).toContain('data-catalog-source-cadence="twice_a_year"');
    expect(wfo).toContain("Оновлюють двічі на рік");
    expect(wfo).not.toContain("Зазначення джерела");

    // Each source's counts are read on their own, from its own snapshot.
    expect(mocks.readCatalogSourceCoverage).toHaveBeenCalledTimes(2);
    expect(mocks.readCatalogSourceCoverage).toHaveBeenCalledWith(SNAPSHOT_EPPO);
    expect(mocks.readCatalogSourceCoverage).toHaveBeenCalledWith(SNAPSHOT_WFO);
    expect(html).not.toContain("data-section-failure=");
    expect(html).not.toContain("data-action-outcome=");
  });

  it("fails one source's counts in its own row, beside its name and freshness, while the other is counted", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.readCatalogSourceCoverage.mockImplementation(
        async (snapshotId: string) => {
          if (snapshotId === SNAPSHOT_EPPO) throw postgresRejection("57014");
          return COVERAGE[snapshotId];
        },
      );

      const html = await render();

      const eppo = rowWith(html, 'data-catalog-source="eppo"');
      const failed = openingTag(eppo, "data-catalog-source-coverage=");
      expect(failed).toContain('data-catalog-source-coverage="failed"');
      expect(failed).toContain('data-section-failure="query_timeout"');
      expect(eppo).toContain(uk.sources.coverageFailed);
      // The reference the owner can quote, and a retry that reads the page
      // again: before hydration a same-page `#source-…` link only scrolls.
      expect(eppo).toContain(
        `Код звірки: ${describeWorkspaceFailure(postgresRejection("57014")).digest}`,
      );
      const retry = openingTag(eppo, 'data-workspace-retry="section"');
      expect(retry).toContain('href="/garden/catalog/sources"');
      expect(retry).not.toContain("#source-");
      expect(eppo).toContain(uk.sources.coverageRetry);
      // Its name and freshness never needed the count.
      expect(eppo).toContain("EPPO Global Database");
      expect(eppo).toContain("data-catalog-source-fetched-at=");
      expect(eppo).toContain("Знімок від 1 вер. 2026 р.");
      expect(eppo).toContain('data-catalog-source-refresh-status="none"');
      expect(eppo).toContain('data-catalog-source-refresh="eppo"');

      const wfo = rowWith(html, 'data-catalog-source="world-flora-online"');
      expect(openingTag(wfo, "data-catalog-source-coverage=")).toContain(
        'data-catalog-source-coverage="ready"',
      );
      expect(wfo).toContain('data-catalog-source-records="400"');
      expect(wfo).toContain(">400 записів</span>");
      expect(wfo).toContain(
        `>${markup("Прив'язано до карток: 300 з 400 (75%)")}</span>`,
      );
      expect(wfo).toContain("250 ідентифікаторів · 380 тверджень");
      expect(wfo).not.toContain("data-section-failure");

      // The list and every other block stand: one failure, in one cell.
      expect(html.match(/data-section-failure=/gu)).toHaveLength(1);
      expect(html).toContain('data-catalog-sources-section="true"');
      expect(
        logged.mock.calls.some((call) =>
          String(call[0]).includes(
            '"surface":"catalog-sources","section":"coverage:eppo"',
          ),
        ),
      ).toBe(true);
    } finally {
      logged.mockRestore();
    }
  });

  it("groups a large count the way the language does, and keeps the unit out of the share", async () => {
    mocks.listCatalogSources.mockResolvedValue([EPPO]);
    mocks.readCatalogSourceCoverage.mockResolvedValue({
      recordCount: 13007,
      linkedCount: 12000,
      identifierCount: 21,
      assertionCount: 1,
    });

    const eppo = rowWith(await render(), 'data-catalog-source="eppo"');

    expect(eppo).toContain('data-catalog-source-records="13007"');
    expect(eppo).toContain(">13 007 записів</span>");
    expect(eppo).toContain(
      `>${markup("Прив'язано до карток: 12 000 з 13 007 (92%)")}</span>`,
    );
    expect(eppo).toContain("21 ідентифікатор · 1 твердження");
  });

  it("counts a snapshot with no records as none, rather than dividing by zero", async () => {
    mocks.readCatalogSourceCoverage.mockResolvedValue({
      recordCount: 0,
      linkedCount: 0,
      identifierCount: 0,
      assertionCount: 0,
    });

    const html = await render();

    const eppo = rowWith(html, 'data-catalog-source="eppo"');
    expect(eppo).toContain('data-catalog-source-records="0"');
    expect(eppo).toContain(">0 записів</span>");
    expect(eppo).not.toContain("%");
    expect(eppo).not.toContain("NaN");
  });

  it.each([
    ["pending", "Оновлення в черзі з 6 вер. 2026 р., 13:30."],
    ["processing", "Оновлюється з 6 вер. 2026 р., 13:30."],
    ["done", "Останнє оновлення завершено 6 вер. 2026 р., 13:30."],
    ["failed", "Оновлення 6 вер. 2026 р., 13:30 не вдалося — буде ще спроба."],
    ["dead", "Оновлення 6 вер. 2026 р., 13:30 не вдалося."],
  ] as const)(
    "says a %s refresh in words, dated by when the job last changed",
    async (status, sentence) => {
      mocks.listCatalogSources.mockResolvedValue([
        {
          ...EPPO,
          refresh: {
            status,
            queuedAt: new Date("2026-09-06T09:00:00.000Z"),
            updatedAt: new Date("2026-09-06T10:30:00.000Z"),
          },
        },
      ]);

      const eppo = rowWith(await render(), 'data-catalog-source="eppo"');

      expect(eppo).toContain(`data-catalog-source-refresh-status="${status}"`);
      expect(eppo).toContain(sentence);
      // The job's row is reused by every press, so the day it was first
      // created dates nothing.
      expect(eppo).not.toContain("12:00");
    },
  );

  it("says a newer snapshot was rejected and the one before it is shown", async () => {
    mocks.listCatalogSources.mockResolvedValue([
      { ...EPPO, rejectedAfterAt: new Date("2026-09-10T09:00:00.000Z") },
    ]);

    const eppo = rowWith(await render(), 'data-catalog-source="eppo"');

    expect(eppo).toContain('data-catalog-source-rejected-after="true"');
    expect(eppo).toContain(
      "Новіший знімок від 10 вер. 2026 р. відхилено — показано попередній.",
    );
  });

  it("says nothing is loaded rather than drawing an empty table", async () => {
    mocks.listCatalogSources.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('data-catalog-sources-empty="true"');
    expect(html).toContain(uk.sources.empty);
    expect(html).not.toContain('data-catalog-sources="true"');
    expect(mocks.readCatalogSourceCoverage).not.toHaveBeenCalled();
  });

  it("never prints one attempt's time as a median or a P95", async () => {
    // Production showed 29672 ms twice, from one attempt (OG-UX-039).
    mocks.readCatalogPickHealth.mockResolvedValue([
      healthRow(7, {
        attempts: 1,
        picked: 1,
        timedPicks: 1,
        medianMsToPick: 29672,
        p95MsToPick: 29672,
      }),
      healthRow(30, {
        attempts: 1,
        picked: 1,
        timedPicks: 1,
        medianMsToPick: 29672,
        p95MsToPick: 29672,
      }),
    ]);

    const html = await render();

    expect(figures(html)).toEqual([
      ["median", "insufficient", "7", "Замало вимірів: 1 з 5"],
      ["median", "insufficient", "30", "Замало вимірів: 1 з 5"],
      ["p95", "insufficient", "7", "Замало вимірів: 1 з 20"],
      ["p95", "insufficient", "30", "Замало вимірів: 1 з 20"],
    ]);
    expect(html).not.toContain('data-catalog-health-figure-status="measured"');
    for (const rendering of ["29672", "29 672", "29,7", "29.7"]) {
      expect(html, rendering).not.toContain(rendering);
    }
    // "1 of 1", not "100%".
    expect(html).toContain('data-catalog-health-picked="1"');
    expect(html).toContain(">1 з 1</span>");
    expect(html).not.toContain("100%");
    expect(html).toContain(
      "Медіану показано від 5 вимірів, P95 — від 20, частки у відсотках — від 5 спроб.",
    );
  });

  it("prints a median from five timed picks and a P95 from twenty, in seconds with the sample beside it", async () => {
    mocks.readCatalogPickHealth.mockResolvedValue([
      healthRow(7, {
        attempts: 12,
        picked: 10,
        ownLabel: 1,
        abandoned: 1,
        timedPicks: 10,
        medianMsToPick: 800,
        p95MsToPick: 4200,
      }),
      healthRow(30, {
        attempts: 30,
        picked: 25,
        ownLabel: 3,
        abandoned: 2,
        timedPicks: 25,
        medianMsToPick: 900,
        p95MsToPick: 4200,
      }),
    ]);

    const html = await render();

    expect(figures(html)).toEqual([
      ["median", "measured", "7", "0,8 с · 10 вимірів"],
      ["median", "measured", "30", "0,9 с · 25 вимірів"],
      ["p95", "insufficient", "7", "Замало вимірів: 10 з 20"],
      ["p95", "measured", "30", "4,2 с · 25 вимірів"],
    ]);
    expect(html).not.toContain("4200");
    expect(html).toContain(">10 з 12 · 83%</span>");
    expect(html).toContain(">25 з 30 · 83%</span>");
    expect(html).toContain(">Тиждень · 16 вер. – 23 вер.</th>");
    expect(html).toContain(">Місяць · 24 серп. – 23 вер.</th>");
  });

  it("says nothing has been measured rather than a zero that reads as an instant", async () => {
    const html = await render();

    expect(html).toContain('data-catalog-health-empty="true"');
    expect(html).toContain(uk.health.empty);
    expect(html).not.toContain('data-catalog-health-table="true"');
    expect(html).not.toContain("0,0 с");
  });

  it("names each rule's precision in words, keeps its code, and gives a percentage only from five", async () => {
    mocks.readCatalogAutoAcceptPrecision.mockResolvedValue([
      { ruleCode: "denomination_equal", applied: 10, reverted: 2 },
      { ruleCode: "shared_identifier", applied: 3, reverted: 1 },
      { ruleCode: "unknown", applied: 1, reverted: 0 },
    ]);

    const html = await render();

    const denomination = rowWith(
      html,
      'data-catalog-health-rule="denomination_equal"',
    );
    expect(firstTag(denomination)).toContain(
      'data-catalog-health-rule-reverted="2"',
    );
    expect(denomination).toContain("Та сама назва сорту чи породи");
    expect(denomination).toContain(">denomination_equal</code>");
    expect(denomination).toContain("2 з 10 · 20%");

    const shared = rowWith(
      html,
      'data-catalog-health-rule="shared_identifier"',
    );
    expect(shared).toContain("Спільний зовнішній ідентифікатор");
    expect(shared).toContain(">shared_identifier</code>");
    expect(shared).toContain(">1 з 3</span>");
    expect(shared).not.toContain("%");

    // An action whose rule is gone is still counted, under a name.
    const unknown = rowWith(html, 'data-catalog-health-rule="unknown"');
    expect(unknown).toContain("Правило без назви");
    expect(unknown).toContain(">unknown</code>");
  });

  it("offers every search miss as a queue item, labelled by the words gardeners typed", async () => {
    mocks.readTopCatalogSearchMisses.mockResolvedValue([MISS]);

    const html = await render();

    const row = rowWith(
      html,
      `data-catalog-health-miss="${MISS.queryNormalized}"`,
    );
    expect(row).toContain("«помідор де барао»");
    expect(row).toContain("9 разів");
    const form = formAround(row, "data-catalog-health-miss-queue=");
    expect(form).toContain('name="queryNormalized" value="помідор де барао"');
    expect(form).toContain('name="locale" value="uk"');
    expect(form).toContain('name="objectKind" value="plant"');
    // The name a speech user says is the one printed on the button, with the
    // query after it (WCAG 2.5.3).
    const button = openingTag(row, "data-catalog-health-miss-queue=");
    expect(button).toContain('aria-label="У чергу рішень: «помідор де барао»"');
    expect(row).toContain(">У чергу рішень</span>");
  });

  it("answers a queued miss by naming it and linking to it in the queue", async () => {
    mocks.readCurationQueueItemSummary.mockResolvedValue(queuedSummary());

    const html = await render({ result: "miss-queued", queueItem: QUEUE_ITEM });

    expect(mocks.readCurationQueueItemSummary).toHaveBeenCalledWith(QUEUE_ITEM);
    expect(html).toContain('id="misses-outcome"');
    expect(notice(html, "miss-queued")).toEqual({
      tone: "success",
      title: "Додано в чергу рішень: «помідор де барао».",
    });
    const link = openingTag(
      html,
      `data-catalog-miss-queue-item="${QUEUE_ITEM}"`,
    );
    expect(link).toContain(
      `href="/garden/catalog/queue?type=label_link&amp;item=${QUEUE_ITEM}#decision"`,
    );
    expect(html).toContain(">Відкрити в черзі</a>");
    // It is the misses' answer, not the sources'.
    expect(html.match(/data-action-outcome=/gu)).toHaveLength(1);
    expect(html).not.toContain('id="sources-outcome"');
  });

  it("says nothing of a queued miss whose item it cannot read back", async () => {
    // A "queued" the record does not show is not reported — neither as done
    // nor, in a success colour, as a failure.
    mocks.readCurationQueueItemSummary.mockResolvedValue(null);

    const html = await render({ result: "miss-queued", queueItem: QUEUE_ITEM });

    expect(html).not.toContain("data-action-outcome=");
    expect(html).not.toContain('id="misses-outcome"');
  });

  it.each([
    [
      "miss-denied",
      "Додавати рішення може лише власник каталогу. Нічого не змінено.",
    ],
    ["miss-failed", "Не вдалося додати в чергу рішень — спробуйте ще раз."],
  ] as const)("answers %s without naming an item", async (result, title) => {
    const html = await render({ result });

    expect(notice(html, result)).toEqual({ tone: "danger", title });
    expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
    expect(html).not.toContain("data-catalog-miss-queue-item");
  });

  it.each([
    [
      "queued",
      "eppo",
      "success",
      "Оновлення поставлено в чергу: EPPO Global Database.",
    ],
    [
      "failed",
      "eppo",
      "danger",
      "Не вдалося поставити оновлення в чергу: EPPO Global Database. Спробуйте ще раз.",
    ],
    [
      "denied",
      "",
      "danger",
      "Оновлювати джерела може лише власник каталогу. Нічого не змінено.",
    ],
    [
      "unknown-source",
      "",
      "danger",
      "Такого джерела немає — нічого не змінено.",
    ],
    // A source that is not listed is named by its slug rather than dropped.
    [
      "queued",
      "gbif-backbone",
      "success",
      "Оновлення поставлено в чергу: gbif-backbone.",
    ],
  ] as const)(
    "answers a %s refresh of %j above the sources",
    async (result, source, tone, title) => {
      const html = await render(source ? { result, source } : { result });

      expect(html).toContain('id="sources-outcome"');
      expect(notice(html, result)).toEqual({ tone, title });
      expect(html.match(/data-action-outcome=/gu)).toHaveLength(1);
      expect(html).not.toContain('id="misses-outcome"');
      expect(mocks.readCurationQueueItemSummary).not.toHaveBeenCalled();
    },
  );

  it("shows no answer for a word no action writes", async () => {
    const html = await render({ result: "refreshed", source: "eppo" });

    expect(html).not.toContain("data-action-outcome=");
  });

  it("offers no button to a reader who may not change anything", async () => {
    mocks.assertAdminCapabilityForScope.mockResolvedValue({
      ...OWNER_ACCESS,
      capabilities: ["operator:read"],
    });
    mocks.readTopCatalogSearchMisses.mockResolvedValue([MISS]);

    const html = await render();

    expect(html).toContain('data-catalog-source="eppo"');
    expect(html).toContain(
      `data-catalog-health-miss="${MISS.queryNormalized}"`,
    );
    expect(html).not.toContain("data-catalog-source-refresh=");
    expect(html).not.toContain("data-catalog-health-miss-queue");
    expect(html).not.toContain("<form");
  });

  it("counts what each source holds that the graph could not place", async () => {
    mocks.readUnplacedRecords.mockResolvedValue([
      { sourceSlug: "eppo", records: 13007, oldestAgeDays: 14 },
      { sourceSlug: "—", records: 2, oldestAgeDays: null },
    ]);

    const html = await render();

    const eppo = rowWith(html, 'data-catalog-unplaced-source="eppo"');
    expect(firstTag(eppo)).toContain('data-catalog-unplaced-records="13007"');
    expect(eppo).toContain("13 007");
    expect(eppo).toContain("14 днів");
    expect(html).not.toContain("data-catalog-unplaced-empty");

    mocks.readUnplacedRecords.mockResolvedValue([]);
    expect(await render()).toContain('data-catalog-unplaced-empty="true"');
  });

  it.each([
    [
      "the source list",
      "listCatalogSources",
      'data-catalog-sources-section="true"',
      "Джерела",
    ],
    [
      "pick health",
      "readCatalogPickHealth",
      'data-catalog-health="true"',
      "Чи працює вибір",
    ],
    [
      "the search misses",
      "readTopCatalogSearchMisses",
      'data-catalog-health-misses-section="true"',
      "Чого шукали і не знайшли",
    ],
    [
      "precision",
      "readCatalogAutoAcceptPrecision",
      'data-catalog-health-precision-section="true"',
      "Точність автоматичних рішень",
    ],
    [
      "the unplaced records",
      "readUnplacedRecords",
      'data-catalog-unplaced-section="true"',
      "Записи джерел, яким немає місця в графі",
    ],
  ] as const)(
    "fails %s on its own and leaves every other block standing",
    async (_label, read, marker, title) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks[read].mockRejectedValue(postgresRejection("08006"));

        const html = await render();

        expect(html).not.toContain(marker);
        expect(html.match(/data-slot="error-state"/gu)).toHaveLength(1);
        expect(openingTag(html, 'data-slot="error-state"')).toContain(
          'data-section-failure="connection_unavailable"',
        );
        // The part's own heading names it, directly above the panel; the
        // panel says what happened rather than repeating the name.
        expect(errorTitle(html)).toBe("Цей розділ зараз недоступний");
        const panel = html.indexOf('data-slot="error-state"');
        const heading = html.lastIndexOf("<h2", panel);
        expect(html.slice(heading, panel)).toContain(`>${title}</h2>`);
        expect(openingTag(html, 'data-workspace-retry="section"')).toContain(
          'href="/garden/catalog/sources"',
        );
        for (const other of [
          'data-catalog-sources-section="true"',
          'data-catalog-health="true"',
          'data-catalog-health-misses-section="true"',
          'data-catalog-health-precision-section="true"',
          'data-catalog-unplaced-section="true"',
        ]) {
          if (other !== marker) expect(html, other).toContain(other);
        }
      } finally {
        logged.mockRestore();
      }
    },
  );

  it("refuses a member with the denied callout, reads nothing, and offers no way to the queue", async () => {
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });

    const html = await render({ result: "queued", source: "eppo" });

    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).toContain('data-catalog-operator-denied="true"');
    expect(html).toContain("Лише для власника каталогу");
    expect(html).not.toContain("data-operator-cross-link");
    expect(html).not.toContain("data-catalog-source=");
    expect(html).not.toContain("data-action-outcome=");
    for (const read of [
      mocks.listCatalogSources,
      mocks.readCatalogSourceCoverage,
      mocks.readCurationQueueItemSummary,
      mocks.readCatalogPickHealth,
      mocks.readTopCatalogSearchMisses,
      mocks.readCatalogAutoAcceptPrecision,
      mocks.readUnplacedRecords,
    ]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it.each([
    [
      "the owner check",
      () =>
        mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        }),
    ],
    [
      "the session",
      () =>
        mocks.resolveWorkspaceViewer.mockResolvedValue({
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        }),
    ],
  ])(
    "says access could not be checked when %s cannot be read, never that it was refused",
    async (_label, arrange) => {
      arrange();

      const html = await render();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(errorTitle(html)).toBe("Не вдалося перевірити доступ");
      expect(html).not.toContain("Доступ заборонено");
      expect(html).not.toContain("Лише для власника каталогу");
      expect(html).toContain('data-section-failure="connection_unavailable"');
      expect(openingTag(html, 'data-workspace-retry="section"')).toContain(
        'href="/garden/catalog/sources"',
      );
      expect(html).not.toContain("data-operator-cross-link");
      expect(mocks.listCatalogSources).not.toHaveBeenCalled();
      expect(mocks.readCatalogPickHealth).not.toHaveBeenCalled();
    },
  );

  it("asks a signed-out visitor to sign in and come back here", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });

    const html = await render();

    expect(html).toContain('data-operator-access-state="sign-in-required"');
    expect(html).toContain('data-sign-in-prompt="true"');
    expect(html).toContain(
      `href="/auth/sign-in?next=${encodeURIComponent("/garden/catalog/sources")}"`,
    );
    expect(html).not.toContain("data-operator-cross-link");
    expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
    expect(mocks.listCatalogSources).not.toHaveBeenCalled();
  });

  it("is never indexed", async () => {
    const { generateMetadata } = await import("./page");

    await expect(generateMetadata()).resolves.toEqual({
      title: "Джерела каталогу",
      robots: { index: false, follow: false },
    });
  });
});
