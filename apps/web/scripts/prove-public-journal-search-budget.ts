/**
 * OVE-220 — local, read-only proof for the bounded public journal search path.
 *
 * The proof uses the real Postgres schema and repositories, forces the
 * Meilisearch-degraded branch, verifies its query shape and query plan, and
 * measures the complete candidate -> results + facets journey. It prints only
 * aggregate timing, count, and plan-node evidence.
 */

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { sql } from "kysely";

loadEnv({ path: ".env.local", override: false, quiet: true });

const SAMPLE_COUNT = 20;
const WARMUP_COUNT = 3;
const LATENCY_BUDGET_MS = 750;
const REPRESENTATIVE_CORPUS_SIZE = 10_000;

class ProofRollback extends Error {
  constructor(readonly report: Record<string, unknown>) {
    super("OVE-220 proof transaction rollback");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function percentile(values: readonly number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );
  return sorted[index] ?? Number.POSITIVE_INFINITY;
}

function collectPlanNodes(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectPlanNodes(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === "Node Type" && typeof child === "string") output.push(child);
    collectPlanNodes(child, output);
  }
  return output;
}

function serializedPlan(value: unknown) {
  return JSON.stringify(value).toLocaleLowerCase("en");
}

async function main() {
  const { assertLoopbackLocalRuntimeEnvironment } =
    await import("../src/lib/local-runtime-safety");
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const { db } = await import("../src/db");
  const {
    buildPublicJournalDirectoryEntriesQuery,
    buildPublicJournalDirectoryFallbackCandidateQuery,
    normalizePublicJournalDirectoryRequest,
    PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT,
  } = await import("../src/server/public-journal-directory-query");
  const {
    listPublicJournalDirectoryFacets,
    listPublicJournalDirectoryPage,
    resolvePublicJournalDirectorySearchScope,
  } = await import("../src/server/public-journal-directory-repository");

  try {
    await db.transaction().execute(async (transaction) => {
      const base = await transaction
        .selectFrom("journal_entries")
        .select("id")
        .where("visibility", "=", "public")
        .where("lifecycle_state", "=", "active")
        .where("entry_scope", "=", "object")
        .where("plant_object_id", "is not", null)
        .executeTakeFirst();
      assert(
        base,
        "Local proof requires one canonical public journal fixture.",
      );

      await sql`
        insert into journal_entries (
          id,
          owner_user_id,
          space_id,
          plant_object_id,
          title,
          body,
          entry_scope,
          entry_date,
          visibility,
          lifecycle_state,
          public_slug,
          public_noindex,
          published_at,
          first_publication_disclosure_version,
          first_publication_disclosed_at,
          client_mutation_id,
          content_class
        )
        select
          md5('ove-220-budget-id-' || generated.ordinal::text)::uuid,
          fixture.owner_user_id,
          fixture.space_id,
          fixture.plant_object_id,
          'Synthetic budget journal ' || generated.ordinal::text,
          'Synthetic bounded search evidence',
          'object',
          current_date,
          'public',
          'active',
          'ove-220-budget-' || generated.ordinal::text,
          true,
          now() - (generated.ordinal * interval '1 second'),
          'ove-220-proof',
          now(),
          'ove-220-budget-' || generated.ordinal::text,
          'editorial'
        from journal_entries as fixture
        cross join generate_series(1, ${REPRESENTATIVE_CORPUS_SIZE}) as generated(ordinal)
        where fixture.id = ${base.id}::uuid
      `.execute(transaction);

      const request = normalizePublicJournalDirectoryRequest({ q: "а" });
      const degradedSearch = async () =>
        ({
          source: "bounded_fallback",
          ids: null,
          reason: "unavailable",
        }) as const;

      const fallbackQuery =
        buildPublicJournalDirectoryFallbackCandidateQuery(transaction);
      const fallbackCompiled = fallbackQuery.compile();
      assert(
        !fallbackCompiled.sql.toLocaleLowerCase("en").includes("ilike"),
        "Fallback candidate selection must not scan journal text.",
      );
      assert(
        fallbackCompiled.parameters.at(-1) ===
          PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT,
        "Fallback candidate selection lost its 256-row cap.",
      );

      const scope = await resolvePublicJournalDirectorySearchScope(request, {
        executor: transaction,
        findSearchCandidates: degradedSearch,
      });
      assert(
        scope.source === "bounded_fallback",
        "Degraded path was not used.",
      );
      assert(
        scope.entryIds?.length ===
          PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT,
        "Representative proof did not exercise the maximum candidate width.",
      );

      const entriesQuery = buildPublicJournalDirectoryEntriesQuery(
        transaction,
        request,
        [],
        scope.entryIds,
      );
      const entriesCompiled = entriesQuery.compile();
      const normalizedSql = entriesCompiled.sql.toLocaleLowerCase("en");
      const candidateFilterPosition = normalizedSql.indexOf(
        '"journal_entries"."id" in',
      );
      const textPredicatePosition = normalizedSql.indexOf("ilike");
      assert(
        candidateFilterPosition >= 0,
        "Search query has no candidate-ID fence.",
      );
      assert(
        textPredicatePosition >= 0,
        "Search query lost its text predicate.",
      );
      assert(
        candidateFilterPosition < textPredicatePosition,
        "Text predicate appears before the candidate-ID fence.",
      );

      const [fallbackPlan, entriesPlan] = await Promise.all([
        fallbackQuery.explain("json", sql`analyze, buffers`),
        entriesQuery.explain("json", sql`analyze, buffers`),
      ]);
      const planText = serializedPlan(entriesPlan);
      assert(
        planText.includes("journal_entries") && planText.includes("id"),
        "Postgres plan does not retain the journal candidate-ID boundary.",
      );
      assert(
        !/seq scan[^}]+(?:title|body)[^}]+~~\*/i.test(planText),
        "Postgres selected a broad journal text scan before the ID boundary.",
      );

      async function measureJourney() {
        const startedAt = performance.now();
        const measuredScope = await resolvePublicJournalDirectorySearchScope(
          request,
          {
            executor: transaction,
            findSearchCandidates: degradedSearch,
          },
        );
        await Promise.all([
          listPublicJournalDirectoryPage(request, "uk", {
            executor: transaction,
            searchScope: measuredScope,
          }),
          listPublicJournalDirectoryFacets({
            executor: transaction,
            searchScope: measuredScope,
          }),
        ]);
        return performance.now() - startedAt;
      }

      for (let index = 0; index < WARMUP_COUNT; index += 1) {
        await measureJourney();
      }
      const durations: number[] = [];
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        durations.push(await measureJourney());
      }
      const p95Ms = percentile(durations, 95);
      const p50Ms = percentile(durations, 50);
      assert(
        p95Ms <= LATENCY_BUDGET_MS,
        `Bounded degraded search p95 ${p95Ms.toFixed(1)}ms exceeds ${LATENCY_BUDGET_MS}ms.`,
      );

      const planNodes = [
        ...new Set([
          ...collectPlanNodes(fallbackPlan),
          ...collectPlanNodes(entriesPlan),
        ]),
      ].sort();
      throw new ProofRollback({
        proof: "OVE-220 public journal search budget",
        environmentClass: "loopback-local",
        mutationClass: "transactional-fixtures-rolled-back",
        representativeCorpusRows: REPRESENTATIVE_CORPUS_SIZE,
        candidateCap: PUBLIC_JOURNAL_DIRECTORY_FALLBACK_CANDIDATE_LIMIT,
        observedCandidates: scope.entryIds.length,
        samples: SAMPLE_COUNT,
        p50Ms: Number(p50Ms.toFixed(1)),
        p95Ms: Number(p95Ms.toFixed(1)),
        budgetMs: LATENCY_BUDGET_MS,
        planNodes,
        result: "PASS",
      });
    });
    throw new Error("Proof transaction committed unexpectedly.");
  } catch (error) {
    if (!(error instanceof ProofRollback)) throw error;
    process.stdout.write(`${JSON.stringify(error.report, null, 2)}\n`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unknown search budget failure"}\n`,
  );
  process.exitCode = 1;
});
