import { describe, expect, it } from "vitest";

import {
  gardenFirstEntryHomepagePath,
  gardenFirstEntryPreselectionPath,
  legacyPublicJournalEntryPath,
  lineageInvitationClaimPath,
  publicCatalogEvidencePath,
  publicCommunityDiscussionPath,
  publicCommunityPath,
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicObjectPassportPath,
  publicProfileBasePath,
  publicTopicPath,
  requestedPublicCatalogPath,
} from "./public-paths";

describe("garden public paths", () => {
  it("builds a homepage start path with enum-only source attribution", () => {
    expect(gardenFirstEntryHomepagePath()).toBe("/garden?source=homepage");
  });

  it("builds public variety preselection without raw referrer or display text", () => {
    const path = gardenFirstEntryPreselectionPath("pomidor-cheri-0000000101");

    expect(path).toBe(
      "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
    );
    expect(path).not.toContain("referrer");
    expect(path).not.toContain("display");
    expect(path).not.toContain("title");
  });

  it("keeps a lineage invitation token in the client-only URL fragment", () => {
    const token = "v1.payload.signature";
    const path = lineageInvitationClaimPath(token);

    expect(path).toBe(
      `/garden/lineage/invitations/claim#token=${encodeURIComponent(token)}`,
    );
    expect(path.split("#")[0]).not.toContain("token");
    expect(path).not.toContain("email");
    expect(path).not.toContain("phone");
    expect(path).not.toContain("referrer");
    expect(path).not.toContain("display");
  });

  it("builds a noindex public lineage object path without contact or token params", () => {
    const objectId = "00000000-0000-4000-8000-000000000101";
    const path = publicLineageObjectPath(objectId);

    expect(path).toBe(`/lineage/objects/${objectId}`);
    expect(path).not.toContain("token");
    expect(path).not.toContain("email");
    expect(path).not.toContain("phone");
    expect(path).not.toContain("referrer");
  });

  it("routes catalog evidence through one address builder: hierarchical once a form has its species, legacy until then", () => {
    expect(
      publicCatalogEvidencePath({
        catalogKind: "plant_variety",
        publicSlug: "cherry-tomato",
      }),
    ).toBe("/variety/cherry-tomato");
    expect(
      publicCatalogEvidencePath({
        catalogKind: "plant_variety",
        publicSlug: "cherry-tomato",
        speciesSlug: "solanum-lycopersicum",
      }),
    ).toBe("/species/solanum-lycopersicum/cherry-tomato");
    expect(
      publicCatalogEvidencePath({
        catalogKind: "species",
        publicSlug: "solanum-lycopersicum",
        speciesSlug: "ignored-for-a-species",
      }),
    ).toBe("/species/solanum-lycopersicum");
    expect(
      publicCatalogEvidencePath({
        catalogKind: "breed",
        publicSlug: "carpathian-bee",
        speciesSlug: "apis-mellifera",
      }),
    ).toBe("/species/apis-mellifera/carpathian-bee");
    expect(
      publicCatalogEvidencePath({ catalogKind: "breed", publicSlug: "carpathian-bee" }),
    ).toBe("/breed/carpathian-bee");
  });

  /**
   * An entry used to answer at three addresses, one per locale. It is never
   * translated, so it has one (ADR-0029 D10) — and the locale-prefixed
   * spellings became 308s rather than pages.
   */
  it("keeps the legacy address for the places that hold a slug without its author", () => {
    expect(legacyPublicJournalEntryPath("demo entry")).toBe(
      "/journal/demo%20entry",
    );
  });

  it("joins the community, topic and discussion addresses to the builders", () => {
    expect(publicCommunityPath("observation-and-care")).toBe(
      "/communities/observation-and-care",
    );
    expect(publicTopicPath("помідори")).toBe(
      `/topics/${encodeURIComponent("помідори")}`,
    );
    expect(
      publicCommunityDiscussionPath("observation-and-care", "c-1"),
    ).toBe("/communities/observation-and-care/discussions/c-1");
  });

  /**
   * Encoding is the reason to have a builder at all. A Cyrillic topic slug
   * written by hand reaches the browser raw, and a slug carrying a slash or a
   * question mark escapes its own route segment.
   */
  it("encodes every segment it is given, including the hostile ones", () => {
    expect(publicTopicPath("a/b")).toBe("/topics/a%2Fb");
    expect(publicCommunityPath("a?b")).toBe("/communities/a%3Fb");
    expect(publicJournalEntryPath("yehor", "полив")).toBe(
      `/@yehor/${encodeURIComponent("полив")}`,
    );
    expect(legacyPublicJournalEntryPath("полив")).toBe(
      `/journal/${encodeURIComponent("полив")}`,
    );
    expect(publicProfileBasePath("@yehor")).toBe("/@yehor");
  });

  /**
   * The address that carries the whole point of the product: whose garden this
   * is, in the URL, without a random suffix (ADR-0029 D9).
   */
  it("puts an entry and a passport under their author", () => {
    expect(publicJournalEntryPath("yehor", "полив-без-календарної-пастки")).toBe(
      `/@yehor/${encodeURIComponent("полив-без-календарної-пастки")}`,
    );
    expect(publicObjectPassportPath("yehor", "томат")).toBe(
      `/@yehor/objects/${encodeURIComponent("томат")}`,
    );
    expect(publicJournalEntryPath("@yehor", "полив")).toBe("/@yehor/полив".replace("полив", encodeURIComponent("полив")));
  });

  it("rebuilds a requested catalog address in the shape it was asked for", () => {
    expect(
      requestedPublicCatalogPath({ kind: "species", speciesSlug: "solanum" }),
    ).toBe("/species/solanum");
    expect(
      requestedPublicCatalogPath({
        kind: "species",
        speciesSlug: "solanum",
        formSlug: "de-barao",
      }),
    ).toBe("/species/solanum/de-barao");
    expect(
      requestedPublicCatalogPath({
        kind: "legacy",
        catalogKind: "breed",
        slug: "apis",
      }),
    ).toBe("/breed/apis");
  });
});
