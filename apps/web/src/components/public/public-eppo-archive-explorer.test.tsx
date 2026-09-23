import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EppoArchiveDetail,
  EppoArchiveExplorer,
  EppoArchiveNotFound,
} from "./public-eppo-archive-explorer";
import type { PublicEppoSourceRecord } from "@/server/catalog-source/public-eppo-explorer-repository";

const RECORD: PublicEppoSourceRecord = {
  eppoCode: "LYPES",
  objectKind: "plant",
  displayName: "Solanum lycopersicum",
  scientificName: "Solanum lycopersicum",
  taxonomicRank: "species",
  parentDisplayName: "Solanum",
  aliases: ["Lycopersicon esculentum"],
  evidenceState: "source_record_not_approved",
  href: "/sources/eppo/LYPES",
  qualityClass: "partial",
  observedAt: "2026-09-03T00:00:00.000Z",
  source: {
    name: "EPPO Global Database",
    url: "https://gd.eppo.int/",
    license: "EPPO Open Data Licence",
    licenseUrl: "https://gd.eppo.int/terms",
    attribution: "EPPO Global Database, EPPO Open Data Licence",
  },
};

describe("EppoArchiveNotFound", () => {
  it("keeps the 404 recovery scoped to the archive and the locale", () => {
    const html = renderToStaticMarkup(<EppoArchiveNotFound locale="bg" />);

    // The shell's `#main-content` is the skip link's one target; the archive
    // no longer claims the id a second time (`OVE-499`).
    expect(html).not.toContain('id="main-content"');
    expect(html).toContain('data-eppo-archive-state="not_found"');
    expect(html).toContain("Такъв запис в архива няма.");
    expect(html).toContain("Опитайте отново");
    expect(html).toContain('href="/bg/sources/eppo"');
    expect(html).not.toContain("/catalog");
  });

  it("keeps the licence attribution and the observation date on every record", () => {
    const html = renderToStaticMarkup(
      <EppoArchiveDetail locale="uk" record={RECORD} />,
    );

    // The EPPO licence requires attribution wherever its data is shown, and a
    // restyle is exactly the change that drops it by accident (`OVE-453`
    // criterion 4). The date is what makes a snapshot a snapshot rather than
    // a claim about now.
    expect(html).toContain("EPPO Global Database");
    expect(html).toContain("EPPO Open Data Licence");
    expect(html).toContain("EPPO Global Database, EPPO Open Data Licence");
    expect(html).toMatch(/<time[^>]*dateTime="2026-09-03/u);
    // The date in the page's language, not the server's (`OVE-499`).
    expect(html).toContain("3 вересня 2026");
    // A reference, said as one, in the reader's words.
    expect(html).toContain("Запис EPPO");
    expect(html).toContain("Запис з EPPO у тому вигляді");
    expect(html).not.toMatch(/безпечн|продуктов|схвален/u);
    expect(html).not.toContain('id="main-content"');
    // And nothing here reaches for the pre-redesign palette any more.
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
  });
});

describe("EppoArchiveExplorer", () => {
  const page = (
    overrides: Partial<Parameters<typeof EppoArchiveExplorer>[0]["page"]> = {},
  ) => ({
    request: { kind: "all" as const, query: "", cursor: null },
    records: [RECORD],
    nextCursor: "eyJuYW1lIjoiU29sYW51bSIsImtleSI6IkxZUEVTIn0",
    qualityClass: "partial" as const,
    ...overrides,
  });

  it("is a reference that sends a gardener to the catalogue, with every record credited", () => {
    const html = renderToStaticMarkup(
      <EppoArchiveExplorer locale="uk" page={page()} state="ready" />,
    );

    expect(html).toContain("Довідкове джерело");
    expect(html).toContain(">Архів EPPO</h1>");
    expect(html).toContain('href="/catalog"');
    expect(html).toContain("Відкрити каталог");
    // How many this page shows, never a nought.
    expect(html).toContain("Показано: 1");
    expect(html).toContain("Запис джерела");
    // The scientific name is Latin, and so is a display name that is one.
    expect(html).toMatch(/<a[^>]*lang="la"[^>]*>Solanum lycopersicum<\/a>/u);
    expect(html).toContain("Інші назви");
    expect(html).toContain("Lycopersicon esculentum");
    // The licence obligation on the record in the list, too.
    expect(html).toContain("EPPO Open Data Licence");
    expect(html).toContain("3 вересня 2026");
    // The next page is a query view: a plain link the browser follows.
    expect(html).toMatch(
      /<a href="\/sources\/eppo\?cursor=[^"]+" data-eppo-archive-next="true"/u,
    );
    expect(html).not.toContain('id="main-content"');
    expect(html).not.toMatch(/безпечн|продуктов|схвален/u);
  });

  it("tells an empty archive from a search that found nothing", () => {
    const empty = renderToStaticMarkup(
      <EppoArchiveExplorer
        locale="ru"
        page={page({ records: [], nextCursor: null })}
        state="empty"
      />,
    );
    expect(empty).toContain('data-eppo-archive-empty="archive"');
    expect(empty).toContain("В архиве пока нет ни одной записи.");
    expect(empty).not.toContain("Показано");

    const none = renderToStaticMarkup(
      <EppoArchiveExplorer
        locale="ru"
        page={page({
          request: { kind: "plant", query: "zzqq", cursor: null },
          records: [],
          nextCursor: null,
        })}
        state="empty"
      />,
    );
    expect(none).toContain('data-eppo-archive-empty="no-results"');
    expect(none).toContain("По «zzqq» записей нет.");
    expect(none).toMatch(
      /<a[^>]*href="\/ru\/sources\/eppo"[^>]*>Показать все записи<\/a>/u,
    );
  });

  it("says what is wrong with a search, and retries an unavailable archive in place", () => {
    const invalid = renderToStaticMarkup(
      <EppoArchiveExplorer
        locale="bg"
        page={page({ records: [], nextCursor: null })}
        state="degraded"
        message="invalid_query"
      />,
    );
    expect(invalid).toContain("Въведете от 2 до 120 знака");

    const unavailable = renderToStaticMarkup(
      <EppoArchiveExplorer
        locale="bg"
        page={page({
          request: { kind: "animal", query: "apis", cursor: null },
          records: [],
          nextCursor: null,
        })}
        state="degraded"
        message="unavailable"
      />,
    );
    expect(unavailable).toContain("Архивът временно не е достъпен");
    expect(unavailable).toMatch(
      /<a href="\/bg\/sources\/eppo\?q=apis&amp;kind=animal"[^>]*>Опитайте отново<\/a>/u,
    );
  });
});
