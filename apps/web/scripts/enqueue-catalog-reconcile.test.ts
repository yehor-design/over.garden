import { describe, expect, it } from "vitest";

import { parseEnqueueReconcileArgs } from "./enqueue-catalog-reconcile";
import { assertEnqueueEnvironment } from "./enqueue-catalog-source-refresh";

describe("enqueueing a reconciliation run for the worker", () => {
  it("takes only a scope the job-queue payload constraint accepts", () => {
    expect(parseEnqueueReconcileArgs(["--scope", "labels"])).toMatchObject({
      scope: "labels",
      sourceSlug: null,
      since: null,
      environment: "local",
    });
    expect(() => parseEnqueueReconcileArgs([])).toThrow("enqueue_scope_invalid");
    // The constraint's closed set is `labels`, `source_records`, `duplicates`;
    // anything else would be refused by the database after the round trip.
    expect(() => parseEnqueueReconcileArgs(["--scope", "everything"])).toThrow(
      "enqueue_scope_invalid",
    );
  });

  it("narrows the source-records scope by source and date, and nothing else", () => {
    expect(
      parseEnqueueReconcileArgs([
        "--scope",
        "source_records",
        "--source",
        "eppo-codes",
        "--since",
        "2026-09-01T00:00:00Z",
      ]),
    ).toMatchObject({
      scope: "source_records",
      sourceSlug: "eppo-codes",
      since: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(() =>
      parseEnqueueReconcileArgs(["--scope", "source_records", "--source", "EPPO Global"]),
    ).toThrow("enqueue_source_slug_invalid");
    expect(() =>
      parseEnqueueReconcileArgs(["--scope", "source_records", "--since", "yesterday"]),
    ).toThrow("enqueue_since_invalid");
    // A label or duplicate run reads everything: a narrowing flag on it would
    // be silently ignored by the worker, so it is refused here instead.
    expect(() =>
      parseEnqueueReconcileArgs(["--scope", "labels", "--source", "eppo-codes"]),
    ).toThrow("enqueue_source_slug_needs_source_records_scope");
    expect(() =>
      parseEnqueueReconcileArgs(["--scope", "duplicates", "--since", "2026-09-01"]),
    ).toThrow("enqueue_since_needs_source_records_scope");
  });

  it("holds the same production gate as a source refresh", () => {
    const remote = "postgresql://user@db.ondigitalocean.com:25060/defaultdb";
    expect(() =>
      assertEnqueueEnvironment(parseEnqueueReconcileArgs(["--scope", "labels"]), remote),
    ).toThrow("enqueue_non_local_mutation_refused");
    expect(
      assertEnqueueEnvironment(
        parseEnqueueReconcileArgs([
          "--scope",
          "labels",
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--allow-non-local-mutation",
        ]),
        remote,
      ),
    ).toEqual({ databaseHostClass: "digitalocean_managed" });
    expect(() =>
      assertEnqueueEnvironment(
        parseEnqueueReconcileArgs(["--scope", "labels", "--environment", "production"]),
        "postgresql://overgarden@127.0.0.1:5432/overgarden",
      ),
    ).toThrow("enqueue_local_database_refused");
  });
});
