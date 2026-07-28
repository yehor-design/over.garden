import { describe, expect, it } from "vitest";

import {
  assertProviderBinding,
  buildRecoveryPlan,
  canonicalJson,
  digestPlan,
  parseClusterRow,
  type ProviderCluster,
} from "./provider";

const SOURCE: ProviderCluster = {
  id: "74437c21-0a5b-43c9-be58-f99a3311d5e0",
  name: "overgarden-postgres-prod-fra1",
  engine: "pg",
  version: "18",
  region: "fra1",
  status: "online",
  size: "db-s-1vcpu-1gb",
};

describe("OVE-230 provider binding", () => {
  it("parses only the redacted provider metadata shape", () => {
    expect(
      parseClusterRow(
        "74437c21-0a5b-43c9-be58-f99a3311d5e0 overgarden-postgres-prod-fra1 pg 18 fra1 online db-s-1vcpu-1gb",
      ),
    ).toEqual(SOURCE);
    expect(() => parseClusterRow("secret-bearing changed shape")).toThrow(
      "metadata shape changed",
    );
  });

  it("produces deterministic canonical plan bytes and binds the approval", () => {
    const plan = buildRecoveryPlan({
      approvalDigest: "a".repeat(64),
      implementationSha: "b".repeat(40),
      source: SOURCE,
      targetName: "overgarden-pitr-drill-20260728",
      restorePointUtc: "2026-07-28T10:00:00.000Z",
    });
    expect(canonicalJson(plan)).toBe(canonicalJson({ ...plan }));
    expect(digestPlan(plan)).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson(plan)).not.toContain(SOURCE.id);
  });

  it("refuses production, URL drift, provider drift, and unrelated CA", () => {
    const provider = {
      ...SOURCE,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      name: "overgarden-pitr-drill-20260728",
    };
    const valid = {
      provider,
      expectedId: provider.id,
      expectedName: provider.name,
      expectedEngine: "pg",
      expectedRegion: "fra1",
      providerHost: "disposable.db.ondigitalocean.com",
      databaseUrl:
        "postgresql://redacted:redacted@disposable.db.ondigitalocean.com:25060/defaultdb",
      productionId: SOURCE.id,
      ca: "-----BEGIN CERTIFICATE-----\nredacted\n-----END CERTIFICATE-----",
    };
    expect(() => assertProviderBinding(valid)).not.toThrow();
    expect(() =>
      assertProviderBinding({ ...valid, expectedId: SOURCE.id }),
    ).toThrow("production");
    expect(() =>
      assertProviderBinding({
        ...valid,
        databaseUrl:
          "postgresql://redacted:redacted@other.db.ondigitalocean.com/defaultdb",
      }),
    ).toThrow("hostname differs");
    expect(() => assertProviderBinding({ ...valid, ca: "unrelated" })).toThrow(
      "CA is missing",
    );
  });
});
