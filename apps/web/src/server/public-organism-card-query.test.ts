import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import {
  assemblePublicOrganismCard,
  buildPublicOrganismCardStatement,
  buildPublicOrganismExperienceStatement,
  emptyPublicOrganismCard,
  hasAcceptedNameDisagreement,
  type PublicOrganismCardRow,
  MENTION_PRESSURE_WEEKS,
  buildPublicOrganismMentionPressureStatement,
} from "./public-organism-card-query";

const ITEM = "11111111-1111-4111-8111-111111111111";

function row(
  overrides: Partial<PublicOrganismCardRow> = {},
): PublicOrganismCardRow {
  return {
    firstHandContentAt: null,
    indexableOverride: null,
    forms: [],
    pests: [],
    hosts: [],
    names: [],
    facts: [],
    identifiers: [],
    sources: [],
    ...overrides,
  };
}

describe("organism card statements", () => {
  it("reads only public, accepted assertions and every related node that is addressable", () => {
    const { sql, parameters } =
      buildPublicOrganismCardStatement(ITEM).compile(compileContext());
    expect(sql).toContain("assertion.rights_class = 'source_public'");
    expect(sql).toContain(
      "assertion.decision in ('automatic', 'curator_accepted')",
    );
    expect(sql).toContain("relation.relation_type = 'form_of'");
    expect(sql).toContain("relation.relation_type = 'pest_of'");
    expect(sql).toContain(
      "form.identity_state = 'active' and form.created_by_user_id is null and form.public_slug is not null",
    );
    expect(sql).toContain('as "sources"');
    expect(sql).toContain("max(assertion.observed_at) as last_observed_at");
    expect(parameters).toContain(ITEM);
  });

  it("counts gardeners over the node and its forms behind the launch predicate", () => {
    const { sql } =
      buildPublicOrganismExperienceStatement(ITEM).compile(compileContext());
    expect(sql).toContain("relation.relation_type = 'form_of'");
    expect(sql).toContain("plant_objects.variety_state = 'selected'");
    expect(sql).toContain("journal_entries.visibility = 'public'");
    expect(sql).toMatch(/content_class/u);
    expect(sql).toContain("count(distinct owner_user_id)::int");
  });
});

describe("observed pest pressure (OVE-397, ADR-0026 D13)", () => {
  it("counts only public entries, only inside the window, and only where a region is shown", () => {
    const { sql, parameters } =
      buildPublicOrganismMentionPressureStatement(ITEM).compile(
        compileContext(),
      );
    // The subjects are this node and every pest of it, so one statement serves
    // a plant's pest section and a pest's own card.
    expect(sql).toContain("relation.relation_type = 'pest_of'");
    expect(sql).toContain("journal_entries.visibility = 'public'");
    expect(sql).toContain("journal_entries.lifecycle_state = 'active'");
    expect(sql).toContain("journal_entries.public_gone_at is null");
    // A region counts only where the object shows one — the same rule the
    // gardener experience section is held to, on the same entries.
    expect(sql).toContain("plant_objects.location_visibility = 'region'");
    expect(sql).toContain("spaces.coarse_region_code");
    expect(sql).toMatch(/entry_date >= current_date - \$\d+ \* interval/u);
    expect(parameters).toContain(MENTION_PRESSURE_WEEKS);
    expect(parameters).toContain(ITEM);
  });

  it("folds a subject's buckets, puts the card's own node first, and counts a gardener once", () => {
    const pest = "00000000-0000-4000-8000-0000000397a1";
    const card = assemblePublicOrganismCard({
      catalogItemId: ITEM,
      locale: "uk",
      fallbackSource: { slug: "species_backbone", name: "Species backbone" },
      experience: [],
      row: {
        firstHandContentAt: null,
        indexableOverride: null,
        forms: [],
        pests: [
          {
            catalogItemId: pest,
            canonicalName: "Leptinotarsa decemlineata",
            catalogKind: "species",
            publicSlug: "leptinotarsa-decemlineata",
            speciesSlug: null,
            hostClass: "major_host",
          },
        ],
        hosts: [],
        names: [],
        facts: [],
        identifiers: [],
        sources: [],
      },
      mentions: [
        { catalogItemId: pest, regionCode: "UA-32", isoWeek: "2026-W36", mentions: 2, gardeners: 1 },
        { catalogItemId: pest, regionCode: "UA-32", isoWeek: "2026-W35", mentions: 1, gardeners: 1 },
        { catalogItemId: pest, regionCode: "UA-51", isoWeek: "2026-W36", mentions: 1, gardeners: 1 },
        { catalogItemId: ITEM, regionCode: null, isoWeek: "2026-W36", mentions: 1, gardeners: 1 },
      ],
    });

    // The card's own node leads, however few mentions it has: the page is
    // about it.
    expect(card.mentionPressure.map((entry) => entry.catalogItemId)).toEqual([
      ITEM,
      pest,
    ]);
    const [own, beetle] = card.mentionPressure;
    expect(own?.name).toBeNull();
    expect(beetle?.name).toBe("Leptinotarsa decemlineata");
    expect(beetle?.publicPath).toContain("leptinotarsa-decemlineata");
    expect(beetle?.mentions).toBe(4);
    expect(beetle?.weeks).toEqual([
      { isoWeek: "2026-W36", mentions: 3 },
      { isoWeek: "2026-W35", mentions: 1 },
    ]);
    expect(beetle?.regions.map((region) => region.code)).toEqual([
      "UA-32",
      "UA-51",
    ]);
    expect(beetle?.regions[0]?.label).toBeTruthy();
    // One gardener writing from two oblasts is one gardener, so the node's
    // total is the largest bucket rather than their sum.
    expect(beetle?.gardeners).toBe(1);
  });

  it("is empty on a node nobody has written about, which is most of them", () => {
    const card = assemblePublicOrganismCard({
      catalogItemId: ITEM,
      locale: "uk",
      fallbackSource: { slug: "species_backbone", name: "Species backbone" },
      experience: [],
      row: null,
    });
    expect(card.mentionPressure).toEqual([]);
  });
});

describe("assemblePublicOrganismCard", () => {
  it("groups names, identifiers and facts by source, labels regions, and finds a disagreement", () => {
    const card = assemblePublicOrganismCard({
      locale: "uk",
      fallbackSource: { slug: "species_backbone", name: "species_backbone" },
      experience: [
        {
          regionCode: "UA-32",
          objectCount: 3,
          gardenerCount: 2,
          totalGardeners: 4,
        },
        {
          regionCode: null,
          objectCount: 2,
          gardenerCount: 2,
          totalGardeners: 4,
        },
        {
          regionCode: "UA-46",
          objectCount: 1,
          gardenerCount: 1,
          totalGardeners: 4,
        },
      ],
      row: row({
        firstHandContentAt: "2026-09-01T00:00:00.000Z",
        forms: [
          {
            catalogItemId: "f1",
            canonicalName: "Де Барао",
            catalogKind: "plant_variety",
            publicSlug: "de-barao",
            speciesSlug: "solanum-lycopersicum",
            hostClass: null,
          },
        ],
        pests: [
          {
            catalogItemId: "p1",
            canonicalName: "Tuta absoluta",
            catalogKind: "species",
            publicSlug: "tuta-absoluta",
            speciesSlug: null,
            hostClass: "major_host",
          },
        ],
        names: [
          {
            displayName: "Solanum lycopersicum",
            nameType: "scientific_accepted",
            locale: "la",
            authorship: "L.",
            isPrimary: true,
            sourceSlug: "col",
            sourceName: "Catalogue of Life",
            sourceVersion: "2026-08",
            observedAt: "2026-09-01T00:00:00.000Z",
          },
          {
            displayName: "Lycopersicon esculentum",
            nameType: "scientific_accepted",
            locale: "la",
            authorship: "Mill.",
            isPrimary: false,
            sourceSlug: "eppo",
            sourceName: "EPPO Global Database",
            sourceVersion: "2026-09",
            observedAt: "2026-09-02T00:00:00.000Z",
          },
          {
            displayName: "помідор",
            nameType: "vernacular",
            locale: "uk",
            authorship: null,
            isPrimary: false,
            sourceSlug: null,
            sourceName: null,
            sourceVersion: null,
            observedAt: null,
          },
        ],
        identifiers: [
          {
            scheme: "eppo",
            value: "LYPES",
            sourceSlug: "eppo",
            sourceName: "EPPO Global Database",
            sourceVersion: "2026-09",
            observedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
        facts: [
          {
            predicate: "distribution_status",
            regionCode: "UA",
            value: "Present",
            valueNormalized: "present",
            sourceSlug: "eppo",
            sourceName: "EPPO Global Database",
            sourceVersion: "2026-09",
            observedAt: "2026-09-03T00:00:00.000Z",
          },
        ],
        sources: [
          {
            sourceSlug: "eppo",
            sourceName: "EPPO Global Database",
            sourceVersion: "2026-09",
            sourceUrl: "https://gd.eppo.int/",
            license: "EPPO",
            licenseUrl: null,
            attributionRequired: true,
            attributionText: "Source: EPPO",
            fetchedAt: "2026-09-02T00:00:00.000Z",
            lastObservedAt: "2026-09-03T00:00:00.000Z",
          },
        ],
      }),
    });

    expect(card.hasFirstHandContent).toBe(true);
    expect(card.formCount).toBe(1);
    expect(card.gardenerCount).toBe(4);
    expect(card.regions).toEqual([
      {
        code: "UA-32",
        label: expect.stringContaining("Київ"),
        objectCount: 3,
        gardenerCount: 2,
      },
      {
        code: "UA-46",
        label: expect.stringContaining("Львів"),
        objectCount: 1,
        gardenerCount: 1,
      },
    ]);
    expect(card.forms[0]).toMatchObject({
      publicPath: "/species/solanum-lycopersicum/de-barao",
      hostClass: null,
    });
    expect(card.pests[0]).toMatchObject({
      publicPath: "/species/tuta-absoluta",
      hostClass: "major_host",
    });
    expect(
      card.sourceGroups.map((group) => [
        group.sourceName,
        group.sourceVersion,
        group.lines.length,
        group.observedAt,
      ]),
    ).toEqual([
      ["Catalogue of Life", "2026-08", 1, "2026-09-01T00:00:00.000Z"],
      ["EPPO Global Database", "2026-09", 3, "2026-09-03T00:00:00.000Z"],
      ["species_backbone", null, 1, null],
    ]);
    expect(card.sourceGroups[0]!.lines[0]).toEqual({
      kind: "name",
      label: "scientific_accepted",
      value: "Solanum lycopersicum L.",
      qualifier: "la",
      observedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(card.sourceGroups[1]!.lines.map((line) => line.kind)).toEqual([
      "name",
      "identifier",
      "fact",
    ]);
    // OVE-394, ADR-0026 D11: the badge, with what EPPO wrote beside it, and
    // the attribution line the licence requires with its download date.
    expect(card.presence).toEqual([
      {
        regionCode: "UA",
        status: "present",
        verbatim: "Present",
        sourceName: "EPPO Global Database",
        observedAt: "2026-09-03T00:00:00.000Z",
      },
    ]);
    // The download date, not the reconciliation date: the snapshot was fetched
    // on the 2nd and last asserted on the 3rd.
    expect(card.attributions).toEqual([
      {
        sourceSlug: "eppo",
        sourceName: "EPPO Global Database",
        text: "Source: EPPO",
        downloadedAt: "2026-09-02T00:00:00.000Z",
      },
    ]);
    expect(card.sourceGroups[1]!.lines[2]).toMatchObject({
      label: "distribution_status",
      value: "present",
      qualifier: "UA",
    });
    expect(card.acceptedNameClaims).toEqual([
      { sourceName: "Catalogue of Life", name: "Solanum lycopersicum" },
      { sourceName: "EPPO Global Database", name: "Lycopersicon esculentum" },
    ]);
    expect(hasAcceptedNameDisagreement(card.acceptedNameClaims)).toBe(true);
    expect(card.sources[0]).toMatchObject({
      sourceSlug: "eppo",
      fetchedAt: "2026-09-02T00:00:00.000Z",
      lastObservedAt: "2026-09-03T00:00:00.000Z",
    });
  });

  it("treats the owner's override as first-hand content and an untouched node as an empty card", () => {
    expect(
      assemblePublicOrganismCard({
        locale: "bg",
        fallbackSource: { slug: "x", name: "x" },
        experience: [],
        row: row({ indexableOverride: true }),
      }).hasFirstHandContent,
    ).toBe(true);
    const empty = assemblePublicOrganismCard({
      locale: "ru",
      fallbackSource: { slug: "x", name: "x" },
      experience: [],
      row: null,
    });
    expect(empty).toEqual(emptyPublicOrganismCard());
    expect(
      hasAcceptedNameDisagreement([
        { sourceName: "a", name: "X" },
        { sourceName: "b", name: "x" },
      ]),
    ).toBe(false);
  });
});

function compileContext() {
  // Kysely's RawBuilder compiles against an executor; a bare Postgres
  // compiler gives the SQL text without a database.
  return new Kysely<never>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe("the presence badge (OVE-394, ADR-0026 D11)", () => {
  const eppoFact = (
    regionCode: string,
    value: string,
    valueNormalized: string | null,
    observedAt: string,
  ) => ({
    predicate: "distribution_status" as const,
    regionCode,
    value,
    valueNormalized,
    sourceSlug: "eppo",
    sourceName: "EPPO Global Database",
    sourceVersion: "2026-09",
    observedAt,
  });

  const cardWith = (facts: ReturnType<typeof eppoFact>[]) =>
    assemblePublicOrganismCard({
      locale: "uk",
      fallbackSource: { slug: "species_backbone", name: "species_backbone" },
      experience: [],
      row: row({ facts }),
    });

  it("shows Ukraine and Bulgaria, in that order, and no other country", () => {
    const card = cardWith([
      eppoFact(
        "BG",
        "Present, widespread",
        "present",
        "2026-09-03T00:00:00.000Z",
      ),
      eppoFact("FR", "Present", "present", "2026-09-03T00:00:00.000Z"),
      eppoFact(
        "UA",
        "Transient, actionable",
        "transient",
        "2026-09-03T00:00:00.000Z",
      ),
    ]);

    expect(card.presence.map((entry) => entry.regionCode)).toEqual([
      "UA",
      "BG",
    ]);
    expect(card.presence[0]!.status).toBe("transient");
  });

  it("never promotes a sub-national row to a country badge", () => {
    // EPPO publishes `UA-` units and the source layer keeps them; D11 stops
    // the product at the country, so this card shows no badge at all.
    const card = cardWith([
      eppoFact(
        "UA-30",
        "Present, few occurrences",
        "present",
        "2026-09-03T00:00:00.000Z",
      ),
    ]);

    expect(card.presence).toEqual([]);
  });

  it("takes the newer observation when two sources answer for one country", () => {
    const card = cardWith([
      eppoFact(
        "UA",
        "Absent, confirmed by survey",
        "absent",
        "2026-09-01T00:00:00.000Z",
      ),
      eppoFact(
        "UA",
        "Present, restricted distribution",
        "present",
        "2026-09-05T00:00:00.000Z",
      ),
    ]);

    expect(card.presence).toHaveLength(1);
    expect(card.presence[0]!.status).toBe("present");
    expect(card.presence[0]!.verbatim).toBe("Present, restricted distribution");
  });

  it("says unknown rather than guessing when the status normalized to nothing", () => {
    const card = cardWith([
      eppoFact(
        "UA",
        "Something EPPO adds in 2027",
        null,
        "2026-09-03T00:00:00.000Z",
      ),
    ]);

    expect(card.presence[0]!.status).toBe("unknown");
    expect(card.presence[0]!.verbatim).toBe("Something EPPO adds in 2027");
  });
});
