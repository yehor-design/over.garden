/** OVE-239 loopback proof with 10,000 transactional fixtures, always rolled back. */
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { sql } from "kysely";

loadEnv({ path: ".env.local", override: false, quiet: true });

const REPRESENTATIVE_CORPUS_SIZE = 10_000;

class ProofRollback extends Error {
  constructor(readonly report: Record<string, unknown>) {
    super("OVE-239 proof rollback");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectSortKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectSortKeys(item, keys);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record["Node Type"] === "Sort" && Array.isArray(record["Sort Key"])) {
      keys.push(
        ...record["Sort Key"].filter(
          (key): key is string => typeof key === "string",
        ),
      );
    }
    for (const child of Object.values(record)) collectSortKeys(child, keys);
  }
  return keys;
}

async function main() {
  assert(
    process.argv.includes("--environment") &&
      process.argv.includes("local") &&
      process.argv.includes("--confirm-environment"),
    "Pass --environment local --confirm-environment local.",
  );
  const { assertLoopbackLocalRuntimeEnvironment } =
    await import("../src/lib/local-runtime-safety");
  assertLoopbackLocalRuntimeEnvironment(process.env);
  const { db } = await import("../src/db");
  const {
    buildPublicCommunityContributionsQuery,
    buildPublicCommunityFallbackCandidateQuery,
  } = await import("../src/server/community-repository");

  try {
    await db.transaction().execute(async (transaction) => {
      const base = await transaction
        .selectFrom("journal_entries")
        .innerJoin(
          "user_handle_registry",
          "user_handle_registry.user_id",
          "journal_entries.owner_user_id",
        )
        .innerJoin(
          "user_public_profiles",
          "user_public_profiles.user_id",
          "journal_entries.owner_user_id",
        )
        .select([
          "journal_entries.owner_user_id as ownerUserId",
          "journal_entries.space_id as spaceId",
          "journal_entries.plant_object_id as objectId",
        ])
        .where("journal_entries.visibility", "=", "public")
        .where("journal_entries.lifecycle_state", "=", "active")
        .where("journal_entries.entry_scope", "=", "object")
        .where("journal_entries.plant_object_id", "is not", null)
        .where("user_handle_registry.lifecycle_state", "=", "current")
        .where("user_public_profiles.profile_visibility", "=", "public")
        .where("user_public_profiles.profile_lifecycle_state", "=", "active")
        .where("user_public_profiles.removed_at", "is", null)
        .executeTakeFirst();
      const community = await transaction
        .selectFrom("communities")
        .select("id")
        .where("lifecycle_state", "=", "active")
        .executeTakeFirst();
      assert(
        base?.objectId && community,
        "Local proof requires canonical public fixtures.",
      );

      await transaction
        .insertInto("community_memberships")
        .values({
          community_id: community.id,
          user_id: base.ownerUserId,
          membership_state: "active",
          banned_at: null,
          left_at: null,
        })
        .onConflict((conflict) =>
          conflict.columns(["community_id", "user_id"]).doUpdateSet({
            membership_state: "active",
            banned_at: null,
            left_at: null,
          }),
        )
        .execute();
      await sql`
        insert into journal_entries (
          id, owner_user_id, space_id, plant_object_id, title, body,
          entry_scope, entry_date, visibility, lifecycle_state, public_slug,
          public_noindex, published_at, first_publication_disclosure_version,
          first_publication_disclosed_at, client_mutation_id, content_class
        )
        select
          md5('ove-239-plan-entry-' || generated.ordinal::text)::uuid,
          ${base.ownerUserId}::uuid, ${base.spaceId}::uuid, ${base.objectId}::uuid,
          'Synthetic community search ' || generated.ordinal::text,
          'Synthetic bounded community search evidence', 'object', current_date,
          'public', 'active', 'ove-239-plan-' || generated.ordinal::text, true,
          now() - (generated.ordinal * interval '1 second'), 'ove-239-proof', now(),
          'ove-239-plan-' || generated.ordinal::text, 'editorial'
        from generate_series(1, ${REPRESENTATIVE_CORPUS_SIZE}) as generated(ordinal)
      `.execute(transaction);
      await sql`
        insert into community_contributions (
          id, community_id, journal_entry_id, contributor_user_id,
          contribution_state, discussion_state, added_at
        )
        select
          md5('ove-239-plan-contribution-' || generated.ordinal::text)::uuid,
          ${community.id}::uuid,
          md5('ove-239-plan-entry-' || generated.ordinal::text)::uuid,
          ${base.ownerUserId}::uuid, 'active', 'open',
          now() - (generated.ordinal * interval '1 second')
        from generate_series(1, ${REPRESENTATIVE_CORPUS_SIZE}) as generated(ordinal)
      `.execute(transaction);
      await sql`analyze community_contributions, journal_entries`.execute(
        transaction,
      );

      const candidateQuery = buildPublicCommunityFallbackCandidateQuery(
        transaction,
        { communityId: community.id, viewerScope: null, kind: "all" },
      );
      const candidates = await candidateQuery.execute();
      const resultQuery = buildPublicCommunityContributionsQuery(transaction, {
        communityId: community.id,
        viewerScope: null,
        query: "synthetic",
        restrictToEntryIds: candidates.map((row) => row.entryId),
        applyTextSearch: true,
        limit: 13,
      });
      const candidateSql = candidateQuery.compile().sql.toLocaleLowerCase("en");
      const resultSql = resultQuery.compile().sql.toLocaleLowerCase("en");
      assert(!candidateSql.includes("ilike"), "Candidate query scans text.");
      assert(candidates.length === 256, "Candidate cap was not exercised.");
      assert(
        resultSql.includes('"journal_entries"."id" in'),
        "ID fence missing.",
      );
      assert(resultSql.includes("ilike"), "Bounded text predicate missing.");
      const [candidatePlan, resultPlan, resultRows] = await Promise.all([
        candidateQuery.explain("json", sql`analyze, buffers`),
        resultQuery.explain("json", sql`analyze, buffers`),
        resultQuery.execute(),
      ]);
      assert(
        collectSortKeys(candidatePlan).length === 0,
        "Fallback candidate plan lost its indexed community order.",
      );
      assert(
        !/seq scan[^}]+(?:title|body)[^}]+~~\*/i.test(
          JSON.stringify(resultPlan).toLocaleLowerCase("en"),
        ),
        "Result plan contains a broad journal text scan.",
      );
      throw new ProofRollback({
        proof: "OVE-239 bounded community plan",
        mutationClass: "transactional-fixtures-rolled-back",
        representativeCorpusRows: REPRESENTATIVE_CORPUS_SIZE,
        candidateCap: 256,
        observedCandidates: candidates.length,
        resultRows: resultRows.length,
        candidatePlanNodeClasses: [
          ...new Set(
            JSON.stringify(candidatePlan).match(/\"Node Type\":\"[^\"]+/g) ??
              [],
          ),
        ],
        candidateSortKeys: collectSortKeys(candidatePlan),
        resultPlanNodeClasses: [
          ...new Set(
            JSON.stringify(resultPlan).match(/\"Node Type\":\"[^\"]+/g) ?? [],
          ),
        ],
        result: "PASS",
      });
    });
    throw new Error("Proof transaction committed unexpectedly.");
  } catch (error) {
    if (!(error instanceof ProofRollback)) throw error;
    process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
  } finally {
    await sql`analyze community_contributions, journal_entries`.execute(db);
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Plan proof failed"}\n`,
  );
  process.exitCode = 1;
});
