import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LINEAR_CONTRACT_POSTURE_CLASSES,
  LINEAR_CONTRACT_POSTURE_DEADLINE_MS,
  LINEAR_CONTRACT_POSTURE_VERSION,
  OVE341_OWNED_CONTRACT_IDS,
  alignLinearContractPostureDescription,
  evaluateLinearContractPosture,
  formatLinearContractPostureReceipt,
  parseLinearContractPostureArguments,
  runLinearContractPostureCheck,
  type LinearContractPostureExport,
} from "./check-linear-contract-posture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function exported(
  identifier: string,
  description: string,
  status = "Backlog",
): LinearContractPostureExport {
  return {
    schemaVersion: "ove341.linearContractExport.v1",
    identifier,
    status,
    expectedDescriptionSha256: digest(description),
    description,
  };
}

async function temporaryExportDirectory(
  contracts: readonly LinearContractPostureExport[],
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "ove341-contract-posture-"),
  );
  temporaryDirectories.push(directory);
  await Promise.all(
    contracts.map((contract) =>
      writeFile(
        path.join(directory, `${contract.identifier}.json`),
        JSON.stringify(contract),
        "utf8",
      ),
    ),
  );
  return directory;
}

describe("OVE-341 saved-contract posture alignment", () => {
  it("keeps the clause vocabulary closed and classifies all four contract states", () => {
    expect(LINEAR_CONTRACT_POSTURE_CLASSES).toEqual([
      "live_instruction",
      "recorded_measurement",
      "already_aligned",
      "out_of_scope",
    ]);

    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-321",
          "Private quarantine and original deletion are mandatory before media readiness.",
        ),
        exported(
          "OVE-322",
          "Historical measurement: stale documents failed closed in the completed run.",
          "Done",
        ),
        exported(
          "OVE-323",
          "ADR-0018 uses format-conversion-only media and serves unresolved session conditions.",
        ),
        exported(
          "OVE-339",
          "Blanket noindex wording is owned by the OVE-339 successor sweep.",
        ),
      ],
      { phase: "before", strictOwnedSet: false },
    );

    expect(receipt.status).toBe("alignment_required");
    expect(receipt.counts).toEqual({
      live_instruction: 1,
      recorded_measurement: 1,
      already_aligned: 1,
      out_of_scope: 1,
    });
    expect(receipt.violations).toEqual([]);
  });

  it("classifies adjacent list clauses independently", () => {
    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-321",
          [
            "* Historical measurement: stale documents failed closed in the completed run.",
            "* Private quarantine and original deletion remain mandatory.",
          ].join("\n"),
        ),
      ],
      { phase: "before", strictOwnedSet: false },
    );

    expect(receipt.counts.recorded_measurement).toBe(1);
    expect(receipt.counts.live_instruction).toBe(1);
  });

  it("does not let existing wording hide a retired live media instruction", () => {
    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-321",
          "The existing owner keeps the media quarantine and derivative lifecycle canonical.",
        ),
      ],
      { phase: "before", strictOwnedSet: false },
    );

    expect(receipt.counts.live_instruction).toBe(1);
    expect(receipt.counts.recorded_measurement).toBe(0);
  });

  it("keeps local-retirement fencing separate from posture instructions", () => {
    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-322",
          "The exclusive fence closes Dexie handles and verifies the control-registry before deletion.",
        ),
        exported(
          "OVE-323",
          "The name-only cleanup retains a foreign_or_orphan_retained database by design.",
        ),
      ],
      { phase: "after", strictOwnedSet: false },
    );

    expect(receipt.status).toBe("aligned");
    expect(receipt.counts.already_aligned).toBe(2);
  });

  it("rewrites only the retired posture while preserving structural owners", () => {
    const source = [
      "# Exact data, state, protocol, and concurrency contract",
      "",
      "The existing task data contract remains unchanged.",
      "",
      "# Non-negotiable invariants",
      "",
      "1. **INV-01 — Media.** Originals enter private quarantine, actual-byte validation precedes a stripped derivative, and original deletion precedes public readiness.",
      "2. **INV-02 — Session.** Another-user or stale-session uncertainty returns a generic denial.",
      "3. **INV-03 — Search.** Meilisearch is public-only and stale documents fail closed.",
      "",
      "# Measurable acceptance criteria",
      "",
      "1. **AC-01 — the same media, session, and search boundary is proved.**",
      "",
      "```bash",
      "pnpm test",
      "```",
      "",
      "# Required context",
      "",
      "Repository authority:",
      "",
      "* `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    ].join("\n");

    const result = alignLinearContractPostureDescription("OVE-321", source);

    expect(result.changeCount).toBeGreaterThanOrEqual(2);
    expect(result.description).toContain("format-conversion-only");
    expect(result.description).toContain(
      "unresolved authorization, ownership, or session condition serves",
    );
    expect(result.description).toContain(
      "PUBLIC_SURFACE_INDEXABILITY_THRESHOLD",
    );
    expect(result.description).toContain("# Measurable acceptance criteria");
    expect(result.description).toContain("1. **AC-01");
    expect(result.description).toContain("pnpm test");
    expect(
      alignLinearContractPostureDescription("OVE-321", result.description)
        .changeCount,
    ).toBe(0);
  });

  it("preserves terminal contracts and out-of-scope contracts byte for byte", () => {
    const terminal =
      "Private quarantine and original deletion were required by the completed receipt.";
    const outside = "Blanket noindex wording belongs to OVE-339.";

    expect(
      alignLinearContractPostureDescription("OVE-321", terminal, "Done"),
    ).toEqual({ description: terminal, changeCount: 0, changedAnchors: [] });
    expect(
      alignLinearContractPostureDescription("OVE-339", outside, "Backlog"),
    ).toEqual({ description: outside, changeCount: 0, changedAnchors: [] });
  });

  it("pins the OVE-322 online-only canon in current context and its first verification block", () => {
    const source = [
      "# Exact data, state, protocol, and concurrency contract",
      "",
      "The legacy bridge remains bounded.",
      "",
      "# Verification commands and required evidence",
      "",
      "## VER-01 — First proof",
      "",
      "```bash",
      "cd apps/web",
      "pnpm test",
      "```",
      "",
      "| Package command | `smoke:legacy-device-retirement` (new) | Execute the retirement browser smoke | required |",
      "",
      "# Failure gates",
      "",
      "Do not transfer, delete, merge, deploy, or mark `Done` when:",
      "",
      "* saved bytes drift;",
      "",
      "# Required context",
      "",
      "Repository authority:",
      "",
      "* `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    ].join("\n");

    const result = alignLinearContractPostureDescription("OVE-322", source);
    const firstBlock = result.description.match(
      /```bash\n([\s\S]*?)\n```/,
    )?.[1];

    expect(result.description).toContain(
      "Repository authority:\n\n* `docs/adr/ADR-0017-online-only-product.md`\n* `docs/adr/ADR-0018-mvp-posture.md`",
    );
    expect(result.description).toContain(
      "Historical provenance only: `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    );
    expect(firstBlock).toBe(
      "cd apps/web\npnpm online-only:canon:check\npnpm test",
    );
    expect(result.description).toContain(
      "the canon checker reports drift or an unowned `runtime_pending_child` entry",
    );
    expect(result.description).toContain(
      'provided by the <issue id="fc867650-efa6-441c-bb88-65738d25e311" href="https://linear.app/overgarden/issue/OVE-320/online-only-architecture-canon-retire-pwa-and-offline-capture-without">OVE-320</issue> prerequisite',
    );
    expect(
      alignLinearContractPostureDescription("OVE-322", result.description)
        .changeCount,
    ).toBe(0);
  });

  it("emits Linear-stable bold markup around the OVE-256 threshold token", () => {
    const source = [
      "# Non-negotiable invariants",
      "",
      "6. **INV-06 — Indexability owner: every new route calls the canonical public-surface indexing policy; all source explorer and thin catalog pages are noindex and excluded from sitemap until a separate quality gate promotes them.**",
      "",
      "# Exact data, state, protocol, and concurrency contract",
      "",
      "The public-read contract remains unchanged.",
      "",
      "# Required context",
      "",
      "Repository authority:",
      "",
      "* `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    ].join("\n");

    const result = alignLinearContractPostureDescription("OVE-256", source);

    expect(result.description).toContain(
      "every public candidate uses** `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`**; below-threshold pages",
    );
    expect(
      alignLinearContractPostureDescription("OVE-256", result.description)
        .changeCount,
    ).toBe(0);
  });

  it("distinguishes source-ingestion quarantine and positive prohibitions from unresolved serving", () => {
    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-254",
          "Conflict quarantine keeps a rights-blocked source family out of product evidence.",
        ),
        exported(
          "OVE-255",
          "A positively resolved non-curator remains denied; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure.",
        ),
      ],
      { phase: "after", strictOwnedSet: false },
    );

    expect(receipt.status).toBe("aligned");
    expect(receipt.counts.already_aligned).toBe(2);
    expect(receipt.violations).toEqual([]);
  });

  it("fails an unclassified posture clause instead of guessing", () => {
    const receipt = evaluateLinearContractPosture(
      [exported("OVE-321", "The quarantine constellation is surprising.")],
      { phase: "before", strictOwnedSet: false },
    );

    expect(receipt.status).toBe("unclassified");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unclassified_clause",
          identifier: "OVE-321",
        }),
      ]),
    );
  });

  it("does not let an ADR-0018 mention hide a retired live instruction", () => {
    const receipt = evaluateLinearContractPosture(
      [
        exported(
          "OVE-321",
          "ADR-0018 applies, but private quarantine and original deletion remain mandatory.",
        ),
      ],
      { phase: "after", strictOwnedSet: false },
    );

    expect(receipt.status).toBe("posture_drift");
    expect(receipt.counts.live_instruction).toBe(1);
  });

  it("refuses stale digests, duplicate identifiers, and an incomplete owned set", () => {
    const stale = exported(
      "OVE-321",
      "ADR-0018 serves unresolved session conditions.",
    );
    stale.expectedDescriptionSha256 = "0".repeat(64);
    const receipt = evaluateLinearContractPosture([stale, { ...stale }], {
      phase: "after",
      strictOwnedSet: true,
    });

    expect(receipt.status).toBe("stale_digest");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stale_description_digest" }),
        expect.objectContaining({ code: "duplicate_contract" }),
        expect.objectContaining({ code: "owned_contract_set_mismatch" }),
      ]),
    );
  });

  it("accepts exactly the fifteen owned Backlog contracts after alignment", () => {
    const contracts = OVE341_OWNED_CONTRACT_IDS.map((identifier) =>
      exported(
        identifier,
        "ADR-0018: format-conversion-only media; PUBLIC_SURFACE_INDEXABILITY_THRESHOLD; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure.",
      ),
    );

    const receipt = evaluateLinearContractPosture(contracts, {
      phase: "after",
      strictOwnedSet: true,
    });

    expect(receipt.status).toBe("aligned");
    expect(receipt.contractCount).toBe(15);
    expect(receipt.counts.live_instruction).toBe(0);
    expect(receipt.violations).toEqual([]);
  });

  it("is deterministic, redacted, bounded, cancellable, and single-writer", async () => {
    const contract = exported(
      "OVE-321",
      "ADR-0018 serves unresolved session conditions.",
    );
    const first = evaluateLinearContractPosture([contract], {
      phase: "after",
      strictOwnedSet: false,
    });
    const second = evaluateLinearContractPosture([contract], {
      phase: "after",
      strictOwnedSet: false,
    });
    expect(first.digest).toBe(second.digest);
    expect(formatLinearContractPostureReceipt(first)).not.toContain(
      contract.description,
    );
    expect(formatLinearContractPostureReceipt(first)).toContain('"entries"');
    expect(first.durationMs).toBeLessThanOrEqual(
      LINEAR_CONTRACT_POSTURE_DEADLINE_MS,
    );

    const timedOut = evaluateLinearContractPosture([contract], {
      phase: "after",
      strictOwnedSet: false,
      deadlineMs: 1,
      now: (() => {
        let call = 0;
        return () => (call++ === 0 ? 0 : 2);
      })(),
    });
    const controller = new AbortController();
    controller.abort();
    const cancelled = evaluateLinearContractPosture([contract], {
      phase: "after",
      strictOwnedSet: false,
      signal: controller.signal,
    });
    expect(timedOut.status).toBe("timed_out");
    expect(cancelled.status).toBe("cancelled");

    const directory = await temporaryExportDirectory([contract]);
    await writeFile(
      path.join(directory, ".ove341-contract-posture.lock"),
      "held",
    );
    const locked = runLinearContractPostureCheck({
      directory,
      phase: "after",
      strictOwnedSet: false,
    });
    expect(locked.status).toBe("scan_already_running");
  });

  it("parses the CLI contract and rejects unknown arguments", () => {
    expect(
      parseLinearContractPostureArguments([
        "--directory",
        "/tmp/contracts",
        "--phase",
        "after",
        "--prove-determinism",
        "--inject-dependency-timeout",
      ]),
    ).toEqual({
      directory: "/tmp/contracts",
      phase: "after",
      proveDeterminism: true,
      injectDependencyTimeout: true,
      strictOwnedSet: true,
    });
    expect(() => parseLinearContractPostureArguments(["--unknown"])).toThrow(
      "unknown_argument",
    );
    expect(LINEAR_CONTRACT_POSTURE_VERSION).toBe(
      "ove341.linearContractPosture.v1",
    );
  });
});
