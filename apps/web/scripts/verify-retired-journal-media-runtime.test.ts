import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPROVED_RETIREMENT_EVIDENCE_DIGEST,
  RetirementPreflightSession,
  approvedRetirementGateFixture,
  classifyRetirementGate,
  collectRetiredJournalMediaRuntimeFindings,
  runRetirementIntegrationFaultMatrix,
} from "./verify-retired-journal-media-runtime";

describe("OVE-349 retired journal-media repository contract", () => {
  it("reports zero active server-draft, quarantine-processing, quality, and obsolete-schema owners", () => {
    expect(collectRetiredJournalMediaRuntimeFindings()).toEqual([]);
  });

  it("keeps the negative inventory scan inside the 60 second budget", () => {
    const startedAt = performance.now();
    collectRetiredJournalMediaRuntimeFindings();
    expect(performance.now() - startedAt).toBeLessThanOrEqual(60_000);
  });

  it("proves migration guards, preserved final columns, and an empty-shape rollback", () => {
    const migration = readFileSync(
      fileURLToPath(
        new URL("../sql/0038_ove349_retire_legacy_journal_media.sql", import.meta.url),
      ),
      "utf8",
    );
    const rollback = readFileSync(
      fileURLToPath(
        new URL(
          "../sql/rollback/0038_ove349_retire_legacy_journal_media.down.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(migration).toContain("select count(*) from journal_entry_drafts");
    expect(migration).toContain("where visibility <> 'public'");
    expect(migration).toContain("where journal_entry_id is null");
    expect(migration).toContain("drop table if exists journal_entry_drafts");
    expect(migration).toContain("check (visibility = 'public')");
    for (const preserved of [
      "upload_generation",
      "declared_size_bytes",
      "derivative_key",
      "revoked_at",
      "public_unreachable_at",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`drop column if exists ${preserved}(?:\\s*[,;])`),
      );
    }
    expect(rollback).toContain("create table if not exists journal_entry_drafts");
    expect(rollback).toContain("alter column visibility set default 'private'");
    expect(rollback).not.toMatch(/insert\s+into\s+journal_entry_drafts/i);
  });

  it("binds destructive cleanup to the exact dependent-row snapshot", () => {
    const operator = readFileSync(
      fileURLToPath(
        new URL("./retire-legacy-journal-media-production.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(operator).toContain(
      "a1fb23b420516632aaa3159efd10b0ae76212372e2049281949fc048198098eb",
    );
    for (const owner of [
      "analytics_events",
      "community_contributions",
      "journal_entry_catalog_mentions",
      "journal_entry_mutation_receipts",
      "journal_entry_object_mentions",
      "journal_entry_topic_signals",
      "public_projection_intents",
      "user_public_profiles",
    ]) {
      expect(operator).toContain(owner);
    }
    expect(operator).toContain("ove349_dependency_cleanup_incomplete");
  });
});

describe("OVE-349 production preflight and fault contract", () => {
  it("production preflight admits only the approved exact aggregate and blocks drift", () => {
    const approved = approvedRetirementGateFixture();
    expect(approved.evidenceDigest).toBe(APPROVED_RETIREMENT_EVIDENCE_DIGEST);
    expect(classifyRetirementGate(approved)).toEqual({
      state: "eligible_zero",
      reason: "approved_exact_test_residue",
    });

    expect(
      classifyRetirementGate({ ...approved, privateEntries: 204 }),
    ).toMatchObject({ state: "drift" });
    expect(
      classifyRetirementGate({ ...approved, publicOverlap: 1 }),
    ).toMatchObject({ state: "blocked_real_state" });
    expect(
      classifyRetirementGate({ ...approved, unfinishedLegacyJobs: 1 }),
    ).toMatchObject({ state: "blocked_inflight" });
  });

  it("production preflight replay, race, provider failure, and rollback remain bounded", async () => {
    await expect(runRetirementIntegrationFaultMatrix()).resolves.toMatchObject({
      exactFixtureApplied: true,
      ambiguousBlocked: true,
      replayIdempotent: true,
      concurrentRaceBlocked: true,
      partialProviderRecovery: true,
      rollbackPreservedPublicState: true,
      publicEntries: 10,
      publicMedia: 14,
    });
  });

  it("performance cancellation fences late evidence admission", async () => {
    const session = new RetirementPreflightSession();
    let releaseDatabase!: (value: string) => void;
    const database = new Promise<string>((resolve) => {
      releaseDatabase = resolve;
    });
    const pending = session.start(
      {
        readDatabase: () => database,
        readProviderLogs: async () => "provider-ok",
      },
      1_000,
    );

    expect(session.inspectBlockingClassificationCommand()).toMatchObject({
      status: "waiting",
    });
    expect(session.cancelRetirementPreflightCommand()).toMatchObject({
      status: "inconclusive",
      reason: "cancelled",
    });
    releaseDatabase("late-database-evidence");
    await expect(pending).resolves.toMatchObject({
      status: "inconclusive",
      reason: "cancelled",
    });
    expect(session.inspectBlockingClassificationCommand()).toMatchObject({
      status: "inconclusive",
      reason: "cancelled",
      admittedEvidence: false,
    });
  });

  it("database read timeout leaves cancel and inspect controls responsive", async () => {
    const session = new RetirementPreflightSession();
    const pending = session.start(
      {
        readDatabase: () => new Promise<string>(() => undefined),
        readProviderLogs: async () => "provider-ok",
      },
      20,
    );
    expect(session.inspectBlockingClassificationCommand().status).toBe("waiting");
    await expect(pending).resolves.toMatchObject({
      status: "inconclusive",
      reason: "database_read_timeout",
    });
    expect(session.cancelRetirementPreflightCommand().status).toBe(
      "inconclusive",
    );
  });

  it("provider log timeout leaves cancel and inspect controls responsive", async () => {
    const session = new RetirementPreflightSession();
    const pending = session.start(
      {
        readDatabase: async () => "database-ok",
        readProviderLogs: () => new Promise<string>(() => undefined),
      },
      20,
    );
    expect(session.inspectBlockingClassificationCommand().status).toBe("waiting");
    await expect(pending).resolves.toMatchObject({
      status: "inconclusive",
      reason: "provider_log_timeout",
    });
    expect(session.inspectBlockingClassificationCommand()).toMatchObject({
      status: "inconclusive",
      admittedEvidence: false,
    });
  });
});
