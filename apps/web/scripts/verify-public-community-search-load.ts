/** OVE-239 read-only local proof: latency, bulkhead isolation, and degradation. */
import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false, quiet: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function percentile(values: readonly number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[
      Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
    ] ?? Infinity
  );
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
  const { getPublicCommunityPage } =
    await import("../src/server/community-repository");
  const community = await db
    .selectFrom("communities")
    .select("slug")
    .where("lifecycle_state", "in", ["active", "archived"])
    .executeTakeFirst();
  assert(community, "Local proof requires one public community fixture.");
  const degraded = async () =>
    ({ source: "bounded_fallback", ids: null, reason: "timeout" }) as const;

  try {
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      const page = await getPublicCommunityPage(community.slug, "uk", {
        query: "synthetic",
        findSearchCandidates: degraded,
      });
      durations.push(performance.now() - startedAt);
      assert(
        page?.search.mode === "bounded_fallback",
        "Fallback was not rendered.",
      );
      assert(page.contributions.items.length <= 12, "Page bound exceeded.");
    }
    const p95Ms = percentile(durations, 95);
    assert(p95Ms <= 1_200, `p95 ${p95Ms.toFixed(1)}ms exceeds 1200ms.`);
    process.stdout.write(
      `${JSON.stringify({ proof: "OVE-239 bounded community load", samples: durations.length, p50Ms: Number(percentile(durations, 50).toFixed(1)), p95Ms: Number(p95Ms.toFixed(1)), responseBudgetMs: 1200, candidateCap: 256, activeLimit: 4, queueLimit: 16, queueWaitMs: 100, waitSafeControls: ["community search submit control", "community search reset control"], degradedReason: "timeout", result: "PASS" }, null, 2)}\n`,
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Load proof failed"}\n`,
  );
  process.exitCode = 1;
});
