/**
 * OVE-227 adversarial parity integration proof.
 *
 * Unit tests prove the contract per field in memory. This script proves the
 * same contract end to end against a real local Meilisearch index and a real
 * Postgres corpus: each injected defect class must make the gate fail, repair
 * must converge, and a second repair must be a no-op.
 *
 * Local only. It writes throwaway documents into the public journal index and
 * mutates one real document's title in the index (never in Postgres), then
 * repairs back to the canonical projection. Output is counts, class names, and
 * SHA-256 digests only.
 */

import process from "node:process";
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

interface CaseResult {
  case: string;
  expectedClass: string;
  observedCounts: Record<string, number>;
  observedDriftFieldClasses: string[];
  observedInvalidReasonClasses: string[];
  passed: boolean;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function requireLocalEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local") {
    throw new Error(
      "Refuse: the adversarial parity proof mutates the index and is local-only.",
    );
  }
  const meiliHost = process.env.MEILISEARCH_HOST ?? "";
  const isLoopback =
    meiliHost.startsWith("http://127.0.0.1:") ||
    meiliHost.startsWith("http://localhost:") ||
    meiliHost.startsWith("http://[::1]:");
  if (!isLoopback) {
    throw new Error(
      "Refuse: MEILISEARCH_HOST must be loopback for the adversarial proof.",
    );
  }
  return environment;
}

async function main() {
  const argv = process.argv.slice(2);
  requireLocalEnvironment(argv);

  const { meiliSearchClient } = await import("../src/server/search/client");
  const {
    applyPublicJournalIndexRepair,
    classifyPublicJournalIndexParity,
    planPublicJournalIndexRepair,
    redactParityReportForEvidence,
    PUBLIC_JOURNAL_ENTRIES_INDEX,
  } = await import("../src/server/search/public-journal-parity");
  const { listGloballyEligibleJournalSearchDocuments } =
    await import("../src/server/search/public-journal-eligibility");

  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);

  const waitFor = async (task: unknown) => {
    const taskUid =
      typeof task === "object" && task && "taskUid" in task
        ? Number((task as { taskUid?: unknown }).taskUid)
        : Number.NaN;
    if (!Number.isFinite(taskUid)) return;
    await meiliSearchClient().tasks.waitForTask(taskUid, {
      timeout: 120_000,
      interval: 200,
    });
  };

  // Start from a converged corpus so every observed class is attributable to
  // the injected defect and not to pre-existing local drift.
  await applyPublicJournalIndexRepair();
  const baseline = redactParityReportForEvidence(
    await classifyPublicJournalIndexParity(),
  );
  const corpusClasses = (counts: Record<string, number>) =>
    counts.missing +
    counts.extraneous +
    counts.stale +
    counts.unsafe_schema +
    counts.duplicate +
    counts.invalid_id;

  if (corpusClasses(baseline.counts as unknown as Record<string, number>) > 0) {
    throw new Error(
      "Refuse: local corpus is not converged after repair; fix local drift first.",
    );
  }

  const eligible = await listGloballyEligibleJournalSearchDocuments();
  const results: CaseResult[] = [];
  const injectedIds: string[] = [];

  const runCase = async (
    name: string,
    expectedClass: string,
    document: Record<string, unknown>,
    expectations: {
      countKey: string;
      reasonClass?: string;
      driftField?: string;
    },
  ) => {
    await waitFor(await index.addDocuments([document], { primaryKey: "id" }));
    if (typeof document.id === "string") injectedIds.push(document.id);

    const observed = redactParityReportForEvidence(
      await classifyPublicJournalIndexParity(),
    );
    const counts = observed.counts as unknown as Record<string, number>;
    const passed =
      (counts[expectations.countKey] ?? 0) > 0 &&
      (expectations.reasonClass
        ? observed.invalidReasonClasses.includes(
            expectations.reasonClass as never,
          )
        : true) &&
      (expectations.driftField
        ? observed.driftFieldClasses.includes(expectations.driftField)
        : true);

    results.push({
      case: name,
      expectedClass,
      observedCounts: counts,
      observedDriftFieldClasses: observed.driftFieldClasses,
      observedInvalidReasonClasses: observed.invalidReasonClasses,
      passed,
    });

    // Repair back to canonical before the next case, so classes never stack.
    await applyPublicJournalIndexRepair();
    if (typeof document.id === "string") {
      await waitFor(await index.deleteDocument(document.id));
      await applyPublicJournalIndexRepair();
    }
  };

  const validShape = (id: string) => ({
    id,
    title: "OVE-227 adversarial fixture",
    body: "Injected by the adversarial parity proof; repair must remove it.",
    publicSlug: `ove227-adversarial-${id.replaceAll("-", "").slice(0, 10)}`,
    publicPath: `/journal/ove227-adversarial-${id.replaceAll("-", "").slice(0, 10)}`,
    locationVisibility: "hidden",
    noindex: true,
    entryDate: "2026-07-27T00:00:00.000Z",
    entryScope: "object",
    createdAt: "2026-07-27T00:00:00.000Z",
    kind: "journal_entry",
    coverSource: "none",
  });

  await runCase("extraneous_document", "extraneous", validShape(randomUUID()), {
    countKey: "extraneous",
  });

  await runCase(
    "invalid_document_id",
    "invalid_id",
    { ...validShape(randomUUID()), id: "ove227-adversarial-not-a-uuid" },
    { countKey: "invalid_id", reasonClass: "invalid_id" },
  );

  await runCase(
    "forbidden_owner_field",
    "unsafe_schema",
    { ...validShape(randomUUID()), ownerUserId: randomUUID() },
    { countKey: "unsafe_schema", reasonClass: "forbidden_field" },
  );

  await runCase(
    "foreign_cover_derivative_url",
    "unsafe_schema",
    {
      ...validShape(randomUUID()),
      coverSource: "separate",
      coverPublicUrl: "https://foreign.example.com/derivative/stale.webp",
    },
    { countKey: "unsafe_schema", reasonClass: "invalid_cover_public_url" },
  );

  // Stale-content cases need a real eligible document to mutate in the index.
  const staleCases: Array<[string, string, Record<string, unknown>]> = [];
  if (eligible.length > 0) {
    const real = eligible[0].document as unknown as Record<string, unknown>;
    staleCases.push(
      ["stale_title", "title", { ...real, title: `${real.title} (stale)` }],
      ["stale_body", "body", { ...real, body: `${real.body} (stale)` }],
      [
        "stale_public_slug_and_path",
        "publicSlug",
        {
          ...real,
          publicSlug: "ove227-stale-slug-0123456789",
          publicPath: "/journal/ove227-stale-slug-0123456789",
        },
      ],
      [
        "stale_entry_date",
        "entryDate",
        { ...real, entryDate: "2000-01-01T00:00:00.000Z" },
      ],
    );
  }

  for (const [name, driftField, document] of staleCases) {
    await waitFor(await index.addDocuments([document], { primaryKey: "id" }));
    const observed = redactParityReportForEvidence(
      await classifyPublicJournalIndexParity(),
    );
    const counts = observed.counts as unknown as Record<string, number>;
    results.push({
      case: name,
      expectedClass: "stale",
      observedCounts: counts,
      observedDriftFieldClasses: observed.driftFieldClasses,
      observedInvalidReasonClasses: observed.invalidReasonClasses,
      passed:
        counts.stale > 0 && observed.driftFieldClasses.includes(driftField),
    });
    await applyPublicJournalIndexRepair();
  }

  // Convergence and idempotency.
  const afterRepair = redactParityReportForEvidence(
    await classifyPublicJournalIndexParity(),
  );
  const secondPlan = await planPublicJournalIndexRepair();
  const converged =
    corpusClasses(afterRepair.counts as unknown as Record<string, number>) ===
      0 && afterRepair.expectedCorpusHash === afterRepair.observedCorpusHash;
  const idempotent =
    secondPlan.actions.reindex === 0 &&
    secondPlan.actions.unindexDelete === 0 &&
    secondPlan.actions.deleteInvalid === 0;

  const failed = results.filter((result) => !result.passed).map((r) => r.case);
  const ok = failed.length === 0 && converged && idempotent;

  console.log(
    JSON.stringify(
      {
        ok,
        environment: "local",
        mode: "adversarial",
        issue: "OVE-227",
        evidenceClass: "public_index_parity_adversarial",
        baseline,
        cases: results,
        staleCasesCovered: staleCases.length,
        staleCasesSkippedReason:
          staleCases.length === 0
            ? "no eligible public journal exists in this local corpus"
            : null,
        convergence: {
          converged,
          idempotent,
          afterRepair,
          secondPlanActions: secondPlan.actions,
        },
        failedCases: failed,
        queueGateNote:
          "zeroGap also requires overdue=0 and terminal_failure=0; a local backlog legitimately holds it false.",
      },
      null,
      2,
    ),
  );

  if (!ok) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "adversarial public index parity proof failed",
  );
  process.exitCode = 1;
});
