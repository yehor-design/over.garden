import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";

import {
  catalogItemObjectCondition,
  catalogItemPublishedPredicate,
  publishedCatalogItemsQuery,
} from "./catalog-publication";

const testDb = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const ITEM = "11111111-1111-4111-8111-111111111111";

describe("the publication rule (OVE-519)", () => {
  it("reads an item's own objects and its forms' — never the owner's override or a clock", () => {
    const compiled =
      sql`select ${catalogItemPublishedPredicate("catalog_items.id")}`.compile(
        testDb,
      );

    expect(compiled.sql).toContain(
      "published_object.variety_state = 'selected'",
    );
    expect(compiled.sql).toContain("item_form.relation_type = 'form_of'");
    expect(compiled.sql).toContain(
      'item_form.to_catalog_item_id = "catalog_items"."id"',
    );
    expect(compiled.sql).toContain("published_entry.visibility = 'public'");
    expect(compiled.sql).toContain(
      "published_entry.lifecycle_state = 'active'",
    );
    expect(compiled.sql).toContain("published_entry.public_gone_at is null");
    expect(compiled.sql).toContain("published_entry.entry_scope = 'object'");
    expect(compiled.sql).toContain(
      "published_entry.owner_user_id = published_object.owner_user_id",
    );
    expect(compiled.sql).not.toMatch(
      /first_hand_content_at|indexable_override/u,
    );
  });

  it("shares one clause with the page's list, bound to the item it is given", () => {
    const compiled =
      sql`select ${catalogItemObjectCondition("plant_objects", ITEM)}`.compile(
        testDb,
      );

    expect(compiled.sql).toContain("plant_objects.catalog_item_id = $1::uuid");
    expect(compiled.sql).toContain("item_form.to_catalog_item_id = $2::uuid");
    expect(compiled.parameters).toEqual([ITEM, ITEM]);
  });

  it("lists every published item once, with the time of its newest entry", () => {
    const compiled = publishedCatalogItemsQuery(testDb).compile();

    expect(compiled.sql).toContain("union all");
    expect(compiled.sql).toContain('max("published"."publishedAt")');
    expect(compiled.sql).toContain('group by "published"."catalogItemId"');
    expect(compiled.sql).not.toMatch(
      /first_hand_content_at|indexable_override/u,
    );
  });
});
