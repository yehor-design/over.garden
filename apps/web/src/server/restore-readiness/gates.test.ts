import { describe, expect, it } from "vitest";

import {
  DISPOSABLE_CLUSTER_NAME_PREFIX,
  evaluateRpoPass,
  evaluateRtoPass,
  isDisposableClusterName,
  PREDECLARED_RPO_MAX_MS,
  PREDECLARED_RTO_MAX_MS,
} from "./contract";
import {
  assertRestoreTargetGate,
  assertTeardownGate,
  hostnameFromDatabaseUrl,
} from "./gates";

const PROD_ID = "74437c21-0a5b-43c9-be58-f99a3311d5e0";
const DISPOSABLE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("OVE-201 restore readiness gates", () => {
  it("accepts a disposable recovery-drill target", () => {
    const result = assertRestoreTargetGate({
      environment: "recovery-drill",
      confirmEnvironment: "recovery-drill",
      confirmClusterId: DISPOSABLE_ID,
      productionClusterId: PROD_ID,
      disposableClusterName: "overgarden-pitr-drill-20260724",
      databaseUrlHostname:
        "overgarden-pitr-drill-20260724-do-user-0.db.ondigitalocean.com",
      requireSslCa: true,
      hasSslCa: true,
    });
    expect(result.ok).toBe(true);
    expect(result.confirmClusterId).toBe(DISPOSABLE_ID);
  });

  it("refuses when confirm id equals production id", () => {
    expect(() =>
      assertRestoreTargetGate({
        environment: "recovery-drill",
        confirmEnvironment: "recovery-drill",
        confirmClusterId: PROD_ID,
        productionClusterId: PROD_ID,
        disposableClusterName: "overgarden-pitr-drill-20260724",
        databaseUrlHostname: "fork.example.com",
        requireSslCa: true,
        hasSslCa: true,
      }),
    ).toThrow(/production cluster/i);
  });

  it("refuses production hostname class on DATABASE_URL", () => {
    expect(() =>
      assertRestoreTargetGate({
        environment: "recovery-drill",
        confirmEnvironment: "recovery-drill",
        confirmClusterId: DISPOSABLE_ID,
        productionClusterId: PROD_ID,
        disposableClusterName: "overgarden-pitr-drill-20260724",
        databaseUrlHostname:
          "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com",
        requireSslCa: true,
        hasSslCa: true,
      }),
    ).toThrow(/production cluster host/i);
  });

  it("refuses non-disposable name patterns", () => {
    expect(isDisposableClusterName("overgarden-postgres-prod-fra1")).toBe(
      false,
    );
    expect(isDisposableClusterName(`${DISPOSABLE_CLUSTER_NAME_PREFIX}x`)).toBe(
      false,
    );
    expect(() =>
      assertRestoreTargetGate({
        environment: "recovery-drill",
        confirmEnvironment: "recovery-drill",
        confirmClusterId: DISPOSABLE_ID,
        productionClusterId: PROD_ID,
        disposableClusterName: "overgarden-postgres-prod-fra1",
        databaseUrlHostname: "fork.example.com",
        requireSslCa: true,
        hasSslCa: true,
      }),
    ).toThrow(/production class|disposable name/i);
  });

  it("refuses teardown that targets production or mismatched ids", () => {
    expect(() =>
      assertTeardownGate({
        confirmDeleteClusterId: PROD_ID,
        disposableClusterId: DISPOSABLE_ID,
        productionClusterId: PROD_ID,
        disposableClusterName: "overgarden-pitr-drill-20260724",
      }),
    ).toThrow(/production cluster/i);

    expect(() =>
      assertTeardownGate({
        confirmDeleteClusterId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        disposableClusterId: DISPOSABLE_ID,
        productionClusterId: PROD_ID,
        disposableClusterName: "overgarden-pitr-drill-20260724",
      }),
    ).toThrow(/exactly match/i);
  });

  it("parses hostname without leaking credentials", () => {
    expect(
      hostnameFromDatabaseUrl(
        "postgresql://doadmin:secret@fork-host.db.ondigitalocean.com:25060/defaultdb",
      ),
    ).toBe("fork-host.db.ondigitalocean.com");
  });

  it("evaluates predeclared RPO/RTO without rewriting thresholds", () => {
    expect(PREDECLARED_RPO_MAX_MS).toBe(3_600_000);
    expect(PREDECLARED_RTO_MAX_MS).toBe(14_400_000);
    expect(evaluateRpoPass(45 * 60 * 1000)).toBe(true);
    expect(evaluateRpoPass(PREDECLARED_RPO_MAX_MS + 1)).toBe(false);
    expect(evaluateRtoPass(55 * 60 * 1000)).toBe(true);
    expect(evaluateRtoPass(PREDECLARED_RTO_MAX_MS + 1)).toBe(false);
  });
});
