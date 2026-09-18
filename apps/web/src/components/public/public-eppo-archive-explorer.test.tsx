import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EppoArchiveDetail,
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

    expect(html).toContain('id="main-content"');
    expect(html).toContain('data-eppo-archive-state="not_found"');
    expect(html).toContain("Безопасен публичен запис не е намерен.");
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
    // And nothing here reaches for the pre-redesign palette any more.
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
  });
});
