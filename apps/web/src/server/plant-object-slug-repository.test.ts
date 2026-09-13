import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { buildTakenPlantObjectSlugsQuery } from "./plant-object-slug-repository";

describe("the object slug's taken set", () => {
  it("is scoped to the gardener and asks for the base and everything suffixed from it", () => {
    const compiled = buildTakenPlantObjectSlugsQuery(
      db,
      "00000000-0000-4000-8000-000000000001",
      "томат",
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = ');
    expect(compiled.sql).toContain('"plant_objects"."public_slug" is not null');
    expect(compiled.sql).toContain('"plant_objects"."public_slug" = ');
    expect(compiled.sql).toContain('"plant_objects"."public_slug" like ');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "томат",
      "томат-%",
      "current",
      "00000000-0000-4000-8000-000000000001",
      "томат",
      "томат-%",
    ]);
  });

  /**
   * Unlike the entry's taken set, this one reads the history too: a passport
   * address that was moved still answers 308 from its old slug (ADR-0029 D8),
   * and a counter that read only the live column would hand that slug to a
   * second object under the same handle.
   */
  it("reads the slug history under the gardener's current handle as well", () => {
    const compiled = buildTakenPlantObjectSlugsQuery(
      db,
      "00000000-0000-4000-8000-000000000001",
      "томат",
    ).compile();
    expect(compiled.sql).toContain("union");
    expect(compiled.sql).toContain('"plant_object_slug_history"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" = ',
    );
  });
});
