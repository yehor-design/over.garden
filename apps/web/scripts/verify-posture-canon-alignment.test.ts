import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  POSTURE_CANON_ALIGNMENT_DEADLINE_MS,
  POSTURE_CANON_ALIGNMENT_VERSION,
  POSTURE_DOCUMENT_LEDGER,
  PostureCanonAlignmentScanSession,
  evaluatePostureCanonAlignment,
  formatPostureCanonAlignmentReceipt,
  parsePostureCanonAlignmentArguments,
  runPostureCanonAlignmentCheck,
  type PostureCanonAlignmentSnapshot,
  type PostureDocumentLedgerEntry,
} from "./verify-posture-canon-alignment";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function digest(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

const HISTORICAL_CONTENT =
  "Status: completed receipt\nThe former dependency fails closed.";

function fixtureLedger(): PostureDocumentLedgerEntry[] {
  return [
    {
      path: "docs/current.md",
      class: "live_authority",
      reason: "current_guardrail",
    },
    {
      path: "docs/history.md",
      class: "historical_receipt",
      reason: "completed_receipt",
      sha256: digest(HISTORICAL_CONTENT),
    },
  ];
}

function alignmentRecord(
  entries: readonly PostureDocumentLedgerEntry[] = fixtureLedger(),
) {
  return [
    "# MVP Posture Contract Alignment",
    "",
    "| Path | Classification | Reason | Decision |",
    "| --- | --- | --- | --- |",
    ...entries.map(
      (entry) =>
        `| \`${entry.path}\` | \`${entry.class}\` | \`${entry.reason}\` | ${entry.class === "live_authority" ? "current control preserved" : "immutable bytes ledger-labelled"} |`,
    ),
  ].join("\n");
}

function alignedSnapshot(): PostureCanonAlignmentSnapshot {
  return {
    files: {
      "docs/current.md": [
        "# Current",
        "OVE-339 posture classification: ADR-0018 keeps this evidence gate outside unresolved-request serving.",
        "The bounded evidence command fails closed.",
      ].join("\n"),
      "docs/history.md": HISTORICAL_CONTENT,
      "docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md": alignmentRecord(),
    },
    changedPaths: [
      "docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md",
      "apps/web/scripts/verify-posture-canon-alignment.ts",
    ],
    mvpPostureReceipt: {
      status: "aligned",
      runtimePendingChildCount: 0,
      activeForbiddenCount: 0,
    },
  };
}

const fixtureOptions = {
  ledger: fixtureLedger(),
  requiredAlignmentMarkers: {
    "docs/current.md": ["OVE-339 posture classification", "ADR-0018"],
  },
};

describe("verify-posture-canon-alignment", () => {
  it("classifies the exact measured set and preserves every historical byte", () => {
    const snapshot = alignedSnapshot();
    const before = structuredClone(snapshot);
    const receipt = evaluatePostureCanonAlignment(snapshot, {
      ...fixtureOptions,
      durationMs: 17,
    });

    expect(snapshot).toEqual(before);
    expect(receipt).toMatchObject({
      version: POSTURE_CANON_ALIGNMENT_VERSION,
      status: "aligned",
      counts: {
        liveAuthority: 1,
        historicalReceipt: 1,
        reconciled: 1,
        ledgerLabelled: 1,
        unclassified: 0,
        runtimePendingChild: 0,
      },
      durationMs: 17,
      violations: [],
    });
    expect(receipt.entries).toEqual([
      expect.objectContaining({
        path: "docs/current.md",
        class: "live_authority",
        state: "reconciled",
      }),
      expect.objectContaining({
        path: "docs/history.md",
        class: "historical_receipt",
        state: "ledger_labelled",
        sha256: digest(HISTORICAL_CONTENT),
      }),
    ]);
  });

  it("fails closed on an added, removed, duplicated, or unclassified document", () => {
    const snapshot = alignedSnapshot();
    snapshot.files["docs/unclassified.md"] =
      "This unknown operator gate fails closed.";
    delete snapshot.files["docs/current.md"];
    const duplicated = [...fixtureLedger(), fixtureLedger()[0]];

    const receipt = evaluatePostureCanonAlignment(snapshot, {
      ...fixtureOptions,
      ledger: duplicated,
    });

    expect(receipt.status).toBe("alignment_required");
    expect(receipt.counts.unclassified).toBeGreaterThan(0);
    expect(receipt.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "duplicate_ledger_path",
        "measured_document_missing",
        "unclassified_document",
      ]),
    );
  });

  it("rejects a rewritten historical receipt and a missing live alignment marker", () => {
    const snapshot = alignedSnapshot();
    snapshot.files["docs/history.md"] += "\nRewritten after completion.";
    snapshot.files["docs/current.md"] =
      "# Current\nThe bounded evidence command fails closed.";

    const receipt = evaluatePostureCanonAlignment(snapshot, fixtureOptions);

    expect(receipt.status).toBe("alignment_required");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "historical_receipt_rewritten",
          path: "docs/history.md",
        }),
        expect.objectContaining({
          code: "live_authority_alignment_missing",
          path: "docs/current.md",
        }),
      ]),
    );
  });

  it("requires the alignment record to name every path and exact class once", () => {
    const snapshot = alignedSnapshot();
    snapshot.files["docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md"] = alignmentRecord([
      fixtureLedger()[0],
    ]);

    const receipt = evaluatePostureCanonAlignment(snapshot, fixtureOptions);

    expect(receipt.status).toBe("alignment_required");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "alignment_record_missing_path",
          path: "docs/history.md",
        }),
      ]),
    );
  });

  it("enforces the documentation-only and out-of-scope change fence", () => {
    const allowed = evaluatePostureCanonAlignment(
      alignedSnapshot(),
      fixtureOptions,
    );
    const changed = alignedSnapshot();
    changed.changedPaths.push("apps/web/src/server/journal-repository.ts");
    const rejected = evaluatePostureCanonAlignment(changed, fixtureOptions);

    expect(allowed.status).toBe("aligned");
    expect(rejected.status).toBe("alignment_required");
    expect(rejected.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "application_scope_change",
          path: "apps/web/src/server/journal-repository.ts",
        }),
      ]),
    );
  });

  it("requires the broad MVP posture classifier to have no pending or forbidden span", () => {
    const snapshot = alignedSnapshot();
    snapshot.mvpPostureReceipt = {
      status: "aligned",
      runtimePendingChildCount: 1,
      activeForbiddenCount: 0,
    };

    const receipt = evaluatePostureCanonAlignment(snapshot, fixtureOptions);

    expect(receipt.status).toBe("alignment_required");
    expect(receipt.counts.runtimePendingChild).toBe(1);
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "mvp_posture_runtime_still_pending" }),
      ]),
    );
  });

  it("replays to one semantic digest and formats a redacted aggregate", () => {
    const first = evaluatePostureCanonAlignment(alignedSnapshot(), {
      ...fixtureOptions,
      durationMs: 1,
    });
    const second = evaluatePostureCanonAlignment(alignedSnapshot(), {
      ...fixtureOptions,
      durationMs: 999,
    });
    const formatted = JSON.parse(formatPostureCanonAlignmentReceipt(first));

    expect(first.semanticDigest).toBe(second.semanticDigest);
    expect(first.entries).toEqual(second.entries);
    expect(formatted).not.toHaveProperty("entries");
    expect(formatted).toMatchObject({
      version: POSTURE_CANON_ALIGNMENT_VERSION,
      status: "aligned",
      counts: first.counts,
      semanticDigest: first.semanticDigest,
    });
    expect(JSON.stringify(formatted)).not.toContain(
      "The former dependency fails closed",
    );
  });

  it("keeps one concurrent owner and exposes responsive status and cancellation commands", async () => {
    let releaseRead: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const session = new PostureCanonAlignmentScanSession({
      readSnapshot: async () => {
        await gate;
        return alignedSnapshot();
      },
      evaluateOptions: fixtureOptions,
    });

    const owner = session.start({ deadlineMs: 1_000 });
    expect(session.inspectAlignmentStatusCommand().status).toBe("scanning");
    await expect(session.start({ deadlineMs: 1_000 })).resolves.toMatchObject({
      status: "scan_already_running",
    });
    expect(session.cancelAlignmentCommand().status).toBe("cancelled");
    releaseRead();
    await expect(owner).resolves.toMatchObject({ status: "cancelled" });
  });

  it("times out without admitting a late dependency result", async () => {
    let resolveLate: (snapshot: PostureCanonAlignmentSnapshot) => void = () =>
      undefined;
    const late = new Promise<PostureCanonAlignmentSnapshot>((resolve) => {
      resolveLate = resolve;
    });
    const session = new PostureCanonAlignmentScanSession({
      readSnapshot: async () => late,
      evaluateOptions: fixtureOptions,
    });

    await expect(session.start({ deadlineMs: 5 })).resolves.toMatchObject({
      status: "timed_out",
      violations: [{ code: "document_scan_timeout" }],
    });
    resolveLate(alignedSnapshot());
    expect(session.inspectAlignmentStatusCommand().status).toBe("timed_out");
  });

  it("parses the CLI proof contract and rejects unknown arguments", () => {
    expect(
      parsePostureCanonAlignmentArguments([
        "--",
        "--prove-determinism",
        "--inject-dependency-timeout",
        "--emit-aggregate-receipt",
      ]),
    ).toEqual({
      proveDeterminism: true,
      injectDependencyTimeout: true,
      emitAggregateReceipt: true,
    });
    expect(() => parsePostureCanonAlignmentArguments(["--unknown"])).toThrow(
      "unknown_argument",
    );
  });

  it("checks the checked-in 49-document repository ledger inside the declared deadline", () => {
    const receipt = runPostureCanonAlignmentCheck({
      repositoryRoot: REPOSITORY_ROOT,
      allowDirty: true,
    });

    expect(POSTURE_DOCUMENT_LEDGER).toHaveLength(49);
    expect(receipt).toMatchObject({
      version: POSTURE_CANON_ALIGNMENT_VERSION,
      status: "aligned",
      counts: {
        liveAuthority: 33,
        historicalReceipt: 16,
        reconciled: 33,
        ledgerLabelled: 16,
        unclassified: 0,
        runtimePendingChild: 0,
      },
      violations: [],
    });
    expect(receipt.durationMs).toBeLessThanOrEqual(
      POSTURE_CANON_ALIGNMENT_DEADLINE_MS,
    );
  });
});
