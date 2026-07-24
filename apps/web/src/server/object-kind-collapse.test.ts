import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeAnalyticsEventProperties } from "@/server/analytics-events";
import {
  defaultObjectKindForCatalogSelection,
  normalizePublicObjectKindFilter,
} from "@/lib/garden/catalog-object-kind";
import { sanitizeInterfaceRouteSearch } from "@/lib/interface-route-policy";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaSql = readFileSync(
  join(webRoot, "sql/0001_walking_skeleton.sql"),
  "utf8",
);
const collapseSql = readFileSync(
  join(webRoot, "sql/0007_ove211_object_kind_collapse.sql"),
  "utf8",
);

const LEGACY_KIND = (["bee", "colony"] as const).join("_");

describe("OVE-211 object-kind collapse contracts", () => {
  it("keeps create-table and recreated checks at plant|animal only", () => {
    expect(schemaSql).toMatch(
      /object_kind text not null default 'plant' check \(object_kind in \('plant', 'animal'\)\)/,
    );
    expect(schemaSql).toMatch(
      /add constraint plant_objects_object_kind_check\s+check \(object_kind in \('plant', 'animal'\)\)/,
    );
    expect(schemaSql).not.toMatch(
      /object_kind in \('plant', 'animal', '[^']+'\)/,
    );
    expect(schemaSql).not.toMatch(
      /object_kind in \('plant', '[^']+', 'animal'\)/,
    );
  });

  it("orders data rewrite before drop/recreate in both bootstrap and catch-up SQL", () => {
    for (const sql of [schemaSql, collapseSql]) {
      const updateAt = sql.indexOf(
        `where object_kind = '${LEGACY_KIND}'`,
      );
      const dropAt = sql.indexOf(
        "drop constraint if exists plant_objects_object_kind_check",
      );
      const addAt = sql.indexOf(
        "add constraint plant_objects_object_kind_check",
      );
      expect(updateAt).toBeGreaterThan(-1);
      expect(dropAt).toBeGreaterThan(updateAt);
      expect(addAt).toBeGreaterThan(dropAt);
    }
  });

  it("maps bee-breed catalog selection to animal", () => {
    expect(
      defaultObjectKindForCatalogSelection("breed", "ua_official_bee_breed"),
    ).toBe("animal");
  });

  it("exposes only all|plant|animal on public kind filters", () => {
    expect(
      sanitizeInterfaceRouteSearch("/objects", "kind=plant&identity=breed"),
    ).toBe("?kind=plant&identity=breed");
    expect(
      sanitizeInterfaceRouteSearch("/objects", "kind=animal"),
    ).toBe("?kind=animal");
    expect(
      sanitizeInterfaceRouteSearch("/journals", `kind=${LEGACY_KIND}`),
    ).toBe("");
    expect(sanitizeInterfaceRouteSearch("/objects", "kind=fungi")).toBe("");
    expect(normalizePublicObjectKindFilter(LEGACY_KIND)).toBe("animal");
  });

  it("keeps workspace objectKind limited to plant and animal entries", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const kinds = getGardenWorkspaceCopy(locale).composer.objectKind;
      expect(Object.keys(kinds).sort()).toEqual([
        "animal",
        "legend",
        "plant",
      ]);
    }
  });

  it("treats historical analytics kind values as animal on read", () => {
    expect(
      normalizeAnalyticsEventProperties({
        object_kind: LEGACY_KIND,
      } as never),
    ).toEqual({ object_kind: "animal" });
    expect(() =>
      normalizeAnalyticsEventProperties({
        object_kind: "fungi",
      } as never),
    ).toThrow(/Unsafe analytics event value for object_kind/);
  });
});
