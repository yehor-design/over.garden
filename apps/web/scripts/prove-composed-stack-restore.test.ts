import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  abortRestore,
  assertNoForbiddenStackMarkers,
  assertSafeStackRestoreReceipt,
  isDisposableTarget,
  parseStackRestoreProofArgs,
  runBackupFetchTimeoutFixture,
  stackStatus,
  STACK_RESTORE_BUDGET_SECONDS,
  STACK_RESTORE_MODES,
  type StackRestoreProofReceipt,
} from "./prove-composed-stack-restore";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

function repoFile(relative: string): string {
  const absolute = path.join(REPO_ROOT, relative);
  expect(existsSync(absolute)).toBe(true);
  return readFileSync(absolute, "utf8");
}

const SAFE_RECEIPT: StackRestoreProofReceipt = {
  schemaVersion: "ove358.composedStackRestore.v1",
  mode: "verify",
  runClass: "database",
  status: "pass",
  terminalClass: "verified",
  backupDigestVerified: true,
  productReadBackPassed: true,
  localesServed: ["uk", "bg", "ru"],
  restoredIdentityCount: 4,
  indexRebuildRowCount: 12,
  unsafeRowsExcluded: 4,
  disposableTargetsRemaining: 0,
  liveSourceUnchanged: true,
  stackRestoreDurationSeconds: 1.1,
  restoreBudgetSeconds: STACK_RESTORE_BUDGET_SECONDS,
  abortReasonClass: null,
  forbiddenMarkersAbsent: true,
  controls: { abortRestoreEnabled: true, stackStatusEnabled: true },
};

describe("composed stack proof arguments", () => {
  it("refuses a mode outside the closed set", () => {
    expect(() => parseStackRestoreProofArgs(["--mode", "destroy"])).toThrowError(
      /--mode must be one of/u,
    );
    expect(() => parseStackRestoreProofArgs([])).toThrowError(
      /--mode must be one of/u,
    );
  });

  it("accepts every declared mode", () => {
    for (const mode of STACK_RESTORE_MODES) {
      expect(parseStackRestoreProofArgs(["--mode", mode]).mode).toBe(mode);
    }
  });

  it("refuses a restore target that is not disposable", () => {
    // The one naming rule that keeps a rehearsal from becoming an incident.
    for (const target of [
      "overgarden",
      "postgres",
      "overgarden_production",
      "overgarden_stack_restore_",
      "overgarden_stack_restore_UPPER",
      "'; drop database overgarden; --",
    ]) {
      expect(isDisposableTarget(target)).toBe(false);
      expect(() =>
        parseStackRestoreProofArgs(["--mode", "verify", "--restored-target", target]),
      ).toThrowError(/disposable database/u);
    }
  });

  it("accepts a target this proof would have created", () => {
    expect(isDisposableTarget("overgarden_stack_restore_a1b2c3d4e5f6")).toBe(
      true,
    );
  });
});

describe("backup fetch timeout", () => {
  it("stops before the restore and claims nothing about the backup", async () => {
    const receipt = await runBackupFetchTimeoutFixture({ mode: "verify" });

    expect(receipt.terminalClass).toBe("degraded");
    expect(receipt.abortReasonClass).toBe("backup_object_fetch_timeout");
    // Nothing was restored, so nothing may claim to have been read back.
    expect(receipt.backupDigestVerified).toBe(false);
    expect(receipt.productReadBackPassed).toBe(false);
    expect(receipt.disposableTargetsRemaining).toBe(0);
    expect(receipt.liveSourceUnchanged).toBe(true);
  });

  it("keeps both wait-safe controls usable during the wait", () => {
    expect(abortRestore()).toBe(true);
    expect(stackStatus()).toBe(true);
  });
});

describe("receipt safety", () => {
  it("rejects a receipt carrying a connection string, a key, or a bucket path", () => {
    const leaks = [
      { dsn: "postgres://user:secret@host/db" },
      { ca: "-----BEGIN PRIVATE KEY-----" },
      { backup: "s3://overgarden-backups/2026-08-31.dump" },
      { objectKey: "2026-08-31.dump" },
      { ownerUserId: "someone" },
      { journalBody: "planted tomatoes today" },
      { note: "48.379433, 31.165580" },
    ];
    for (const leak of leaks) {
      expect(() =>
        assertNoForbiddenStackMarkers({ ...SAFE_RECEIPT, ...leak }),
      ).toThrowError(/forbidden_marker/u);
    }
  });

  it("accepts a receipt of classes, counts, digests, and durations", () => {
    expect(() => assertNoForbiddenStackMarkers(SAFE_RECEIPT)).not.toThrow();
    expect(assertSafeStackRestoreReceipt(SAFE_RECEIPT)).toBe(SAFE_RECEIPT);
  });

  it("refuses a verified restore that never read the product back", () => {
    // The whole contract in one assertion: a database that exists is not a
    // recovered product.
    expect(() =>
      assertSafeStackRestoreReceipt({
        ...SAFE_RECEIPT,
        productReadBackPassed: false,
      }),
    ).toThrowError(/without_a_product_read_back/u);
  });

  it("refuses a run that left a disposable target behind", () => {
    expect(() =>
      assertSafeStackRestoreReceipt({
        ...SAFE_RECEIPT,
        disposableTargetsRemaining: 1,
      }),
    ).toThrowError(/left_behind/u);
  });

  it("refuses a rehearsal that changed the live source", () => {
    expect(() =>
      assertSafeStackRestoreReceipt({
        ...SAFE_RECEIPT,
        liveSourceUnchanged: false,
      }),
    ).toThrowError(/rehearses_protecting/u);
  });

  it("refuses a restore over the budget", () => {
    expect(() =>
      assertSafeStackRestoreReceipt({
        ...SAFE_RECEIPT,
        stackRestoreDurationSeconds: STACK_RESTORE_BUDGET_SECONDS + 1,
      }),
    ).toThrowError(/budget_exceeded/u);
  });
});

describe("composed stack definition", () => {
  const compose = () => repoFile("infra/docker-compose.stack.yml");

  it("defines every service the product needs to run on one host", () => {
    const definition = compose();
    for (const service of [
      "postgres:",
      "pgbouncer:",
      "meilisearch:",
      "matching-worker:",
      "caddy:",
    ]) {
      expect(definition).toContain(service);
    }
  });

  it("pins the search image to its multi-architecture index digest", () => {
    // The production file pins the linux/amd64 manifest alone, which cannot be
    // pulled on an ARM host. A stack meant to run anywhere has to pin the index.
    const definition = compose();
    expect(definition).toContain(
      "sha256:ad98ec0ab2a387da5c140fe9d935eadc6e3a42aee185b4249dfafd985fb49e1c",
    );
    expect(definition).not.toContain(
      "sha256:93ea15e3e46499281fb5bcd55c63e147d76680073ebd95a3a74d632176225d8a",
    );
  });

  it("serves Postgres over TLS and gives the pooler the authority to verify it", () => {
    const definition = compose();
    expect(definition).toContain("ssl=on");
    expect(definition).toContain("ssl_cert_file=/etc/postgres-tls/server.crt");
    expect(definition).toContain("SERVER_TLS_SSLMODE: verify-full");
    expect(definition).toContain("SERVER_TLS_CA_FILE: /etc/postgres-tls/ca.crt");
  });

  it("routes the worker around the pooler, because transaction pooling has no session", () => {
    // `LISTEN`/`NOTIFY` needs a session that outlives a transaction. Sending the
    // worker through a transaction-pooled connection would silently stop it
    // waking, and the fallback poll would hide it.
    const definition = compose();
    expect(definition).toContain("POOL_MODE: transaction");
    expect(definition).toMatch(/DIRECT_URL:[\s\S]*@postgres:5432/u);
  });

  it("publishes exactly one service to the host", () => {
    const definition = compose();
    const published = definition.match(/^\s{4}ports:/gmu) ?? [];
    expect(published).toHaveLength(1);
  });
});

describe("stack operator command", () => {
  const script = () => repoFile("infra/overgarden-stack");

  it("exposes the closed subcommand set and refuses anything else", () => {
    const source = script();
    for (const subcommand of [
      "up)",
      "down)",
      "status)",
      "backup)",
      "restore)",
      "verify)",
    ]) {
      expect(source).toContain(subcommand);
    }
    expect(source).toContain("unknown subcommand");
  });

  it("refuses to drop a database it did not create", () => {
    expect(script()).toContain(
      "refusing to drop a database this script did not create",
    );
  });

  it("names a backup by the digest of its own bytes", () => {
    const source = script();
    expect(source).toContain("openssl dgst -sha256");
    expect(source).toContain("backup digest does not verify");
  });

  it("deletes the disposable target on every terminal path of verify", () => {
    // Including the failing one: `verify` tears down before it reports.
    const source = script();
    const verifyBody = source.slice(source.indexOf("stack_verify() {"));
    expect(verifyBody).toContain("stack_teardown_restore");
  });
});
