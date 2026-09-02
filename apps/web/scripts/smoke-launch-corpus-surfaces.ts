import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";

import { db } from "@/db";
import {
  JOURNAL_CONTENT_CLASSES,
  PUBLIC_LAUNCH_CONTENT_CLASSES,
} from "@/lib/launch-corpus/content-class";
import { PUBLIC_LAUNCH_SURFACE_POLICY_VERSION } from "@/server/launch-corpus/public-surface";
import { PUBLIC_LAUNCH_JOURNAL_CALLERS } from "@/server/launch-corpus/public-surface-inventory";
import {
  buildPublicJournalEntryLifecycleQuery,
  buildPublicJournalEntryLookupQuery,
} from "@/server/journal-repository";
import {
  buildPublicObjectPassportRootQuery,
  buildPublicObjectPassportTimelineQuery,
} from "@/server/public-object-passport-repository";
import {
  buildPublicProfileEntrySummaryQuery,
  buildPublicProfileJournalEvidenceQuery,
} from "@/server/public-profile-repository";

loadEnv({ path: ".env.local" });

const PERFORMANCE_BUDGET_MS = 5_000;

async function main() {
  const startedAt = performance.now();
  const allowed = new Set<string>(PUBLIC_LAUNCH_CONTENT_CLASSES);
  const result = await db.transaction().execute(async (trx) => {
    const baseline = await trx
      .selectFrom("journal_entries")
      .select([
        "owner_user_id as ownerUserId",
        "space_id as spaceId",
        "plant_object_id as plantObjectId",
      ])
      .where("entry_scope", "=", "object")
      .where("plant_object_id", "is not", null)
      .where("visibility", "=", "public")
      .where("lifecycle_state", "=", "active")
      .where("public_gone_at", "is", null)
      .where("public_slug", "is not", null)
      .where("content_class", "in", [...PUBLIC_LAUNCH_CONTENT_CLASSES])
      .$narrowType<{ plantObjectId: string }>()
      .executeTakeFirstOrThrow();

    const beforeRoot = await buildPublicObjectPassportRootQuery(
      trx,
      baseline.plantObjectId,
    ).executeTakeFirstOrThrow();
    const beforeProfile = await buildPublicProfileEntrySummaryQuery(
      trx,
      baseline.ownerUserId,
    ).executeTakeFirstOrThrow();

    const rows = JOURNAL_CONTENT_CLASSES.map((contentClass) => {
      const token = randomUUID();
      return {
        id: token,
        owner_user_id: baseline.ownerUserId,
        space_id: baseline.spaceId,
        plant_object_id: baseline.plantObjectId,
        entry_scope: "object",
        title: "Launch corpus policy probe",
        body: "Synthetic local policy evidence; never production content.",
        entry_date: new Date("2026-01-01T00:00:00.000Z"),
        visibility: "public",
        lifecycle_state: "active",
        public_slug: `ove221-policy-${token}`,
        public_noindex: true,
        published_at: new Date("2026-01-01T00:00:00.000Z"),
        public_gone_at: null,
        archived_at: null,
        client_mutation_id: `ove221-policy-${token}`,
        content_class: contentClass,
        source_language:
          contentClass === "founder_first_hand" || contentClass === "editorial"
            ? "uk"
            : null,
        cover_media_asset_id: null,
        content_document: null,
        content_schema_version: null,
        first_publication_disclosed_at: null,
        first_publication_disclosure_version: null,
      };
    });

    await trx.insertInto("journal_entries").values(rows).execute();

    let directEligible = 0;
    let directExcluded = 0;
    let lifecycleEligible = 0;
    let lifecycleExcluded = 0;
    for (const row of rows) {
      const direct = await buildPublicJournalEntryLookupQuery(
        trx,
        row.public_slug,
      ).executeTakeFirst();
      const lifecycle = await buildPublicJournalEntryLifecycleQuery(
        trx,
        row.public_slug,
      ).executeTakeFirst();
      if (allowed.has(row.content_class)) {
        if (!direct || !lifecycle)
          throw new Error("Eligible direct row missing.");
        directEligible += 1;
        lifecycleEligible += 1;
      } else {
        if (direct || lifecycle) throw new Error("Excluded direct row leaked.");
        directExcluded += 1;
        lifecycleExcluded += 1;
      }
    }

    const timeline = await buildPublicObjectPassportTimelineQuery(
      trx,
      baseline.plantObjectId,
      40,
    ).execute();
    const profileEntries = await buildPublicProfileJournalEvidenceQuery(
      trx,
      baseline.ownerUserId,
    ).execute();
    const timelineIds = new Set(timeline.map((row) => row.entryId));
    const profileIds = new Set(profileEntries.map((row) => row.entryId));
    for (const row of rows) {
      const expected = allowed.has(row.content_class);
      if (
        timelineIds.has(row.id) !== expected ||
        profileIds.has(row.id) !== expected
      ) {
        throw new Error("Relationship surface policy mismatch.");
      }
    }

    const afterRoot = await buildPublicObjectPassportRootQuery(
      trx,
      baseline.plantObjectId,
    ).executeTakeFirstOrThrow();
    const afterProfile = await buildPublicProfileEntrySummaryQuery(
      trx,
      baseline.ownerUserId,
    ).executeTakeFirstOrThrow();
    const expectedDelta = PUBLIC_LAUNCH_CONTENT_CLASSES.length;
    if (
      Number(afterRoot.publicEntryCount) -
        Number(beforeRoot.publicEntryCount) !==
        expectedDelta ||
      Number(afterProfile.publicEntryCount) -
        Number(beforeProfile.publicEntryCount) !==
        expectedDelta
    ) {
      throw new Error("Count surface policy mismatch.");
    }

    await trx
      .deleteFrom("journal_entries")
      .where(
        "id",
        "in",
        rows.map((row) => row.id),
      )
      .execute();

    return {
      directEligible,
      directExcluded,
      lifecycleEligible,
      lifecycleExcluded,
      relationshipEligible: expectedDelta,
      relationshipExcluded: rows.length - expectedDelta,
      countDelta: expectedDelta,
    };
  });

  const durationMs = performance.now() - startedAt;
  if (durationMs > PERFORMANCE_BUDGET_MS) {
    throw new Error("Launch surface matrix exceeded its bounded budget.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-221",
        evidenceClass: "launch_surface_matrix",
        policyVersion: PUBLIC_LAUNCH_SURFACE_POLICY_VERSION,
        contentClassCases: JOURNAL_CONTENT_CLASSES.length,
        callerCount: PUBLIC_LAUNCH_JOURNAL_CALLERS.length,
        ...result,
        launch_surface_matrix_latency: Math.round(durationMs),
        performanceBudgetMs: PERFORMANCE_BUDGET_MS,
        cleanup: "transactional synthetic rows removed",
        evidenceSafety: "counts_classes_and_timing_only",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Launch corpus surface smoke failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
