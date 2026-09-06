import { describe, expect, it } from "vitest";

import {
  gardenFirstEntryHomepagePath,
  gardenFirstEntryPreselectionPath,
  lineageInvitationClaimPath,
  publicLineageObjectPath,
  publicCatalogEvidencePath,
  localizedPublicJournalEvidencePath,
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

  it("keeps interactive journal evidence in the resolved public locale", () => {
    expect(localizedPublicJournalEvidencePath("uk", "demo entry")).toBe(
      "/journal/demo%20entry",
    );
    expect(localizedPublicJournalEvidencePath("bg", "demo entry")).toBe(
      "/bg/journal/demo%20entry",
    );
    expect(localizedPublicJournalEvidencePath("ru", "demo entry")).toBe(
      "/ru/journal/demo%20entry",
    );
  });
});
