import { describe, expect, it } from "vitest";

import {
  assertEnqueueEnvironment,
  parseEnqueueSourceRefreshArgs,
} from "./enqueue-catalog-source-refresh";

const productionArgs = [
  "--source",
  "eppo-codes",
  "--environment",
  "production",
  "--confirm-environment",
  "production",
  "--allow-non-local-mutation",
];

describe("enqueueing a source refresh for the worker", () => {
  it("takes only a slug the job-queue payload constraint accepts", () => {
    expect(
      parseEnqueueSourceRefreshArgs(["--source", "eppo-codes"]),
    ).toMatchObject({ sourceSlug: "eppo-codes", environment: "local" });
    expect(() => parseEnqueueSourceRefreshArgs([])).toThrow(
      "enqueue_source_slug_invalid",
    );
    // The constraint is `^[a-z0-9]+(-[a-z0-9]+)*$`; anything else would be
    // refused by the database after the round trip instead of here.
    expect(() =>
      parseEnqueueSourceRefreshArgs(["--source", "EPPO Global"]),
    ).toThrow("enqueue_source_slug_invalid");
    expect(() =>
      parseEnqueueSourceRefreshArgs(["--source", "eppo_codes"]),
    ).toThrow("enqueue_source_slug_invalid");
  });

  it("refuses a remote database that nobody named production three times", () => {
    const remote = "postgresql://user@db.ondigitalocean.com:25060/defaultdb";
    expect(() =>
      assertEnqueueEnvironment(
        parseEnqueueSourceRefreshArgs(["--source", "eppo-codes"]),
        remote,
      ),
    ).toThrow("enqueue_non_local_mutation_refused");
    expect(() =>
      assertEnqueueEnvironment(
        parseEnqueueSourceRefreshArgs([
          "--source",
          "eppo-codes",
          "--environment",
          "production",
          "--confirm-environment",
          "production",
        ]),
        remote,
      ),
    ).toThrow("enqueue_non_local_mutation_refused");
    expect(
      assertEnqueueEnvironment(
        parseEnqueueSourceRefreshArgs(productionArgs),
        remote,
      ),
    ).toEqual({ databaseHostClass: "digitalocean_managed" });
  });

  it("refuses the loopback database when the operator said production", () => {
    // A production flag against a local database is a mistake in the other
    // direction, and it would put a job nobody is watching on a queue nobody
    // drains.
    expect(() =>
      assertEnqueueEnvironment(
        parseEnqueueSourceRefreshArgs(productionArgs),
        "postgresql://overgarden@127.0.0.1:5432/overgarden",
      ),
    ).toThrow("enqueue_local_database_refused");
    expect(
      assertEnqueueEnvironment(
        parseEnqueueSourceRefreshArgs(["--source", "eppo-codes"]),
        "postgresql://overgarden@127.0.0.1:5432/overgarden",
      ),
    ).toEqual({ databaseHostClass: "loopback" });
  });
});
