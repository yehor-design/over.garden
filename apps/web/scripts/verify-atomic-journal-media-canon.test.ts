import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATOMIC_JOURNAL_MEDIA_CANON_DEADLINE_MS,
  ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
  evaluateAtomicJournalMediaCanon,
  formatAtomicJournalMediaCanonReceipt,
  runAtomicJournalMediaCanonVerification,
  type AtomicJournalMediaCanonInput,
} from "./verify-atomic-journal-media-canon";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

const HISTORICAL_ADR_0017 = "ADR-0017 immutable historical body";
const HISTORICAL_ADR_0018 = "ADR-0018 immutable historical body";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function alignedInput(): AtomicJournalMediaCanonInput {
  const currentAuthority = [
    ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
    "docs/adr/ADR-0019-atomic-local-journal-media.md",
    "local-only and non-durable before Publish",
    "browser-generated WebP is the sole final artifact",
    "image bytes never traverse a Vercel Function",
    "overgarden-media-staging",
    "media-stage.over.garden",
    "MEDIA_STAGING_SESSIONS",
    "provisioned by OVE-346",
    "OVE-333 -> OVE-345 -> OVE-346 -> OVE-347 -> OVE-348 -> OVE-349 -> OVE-350",
  ].join("\n");

  return {
    baselineSha: "7".repeat(40),
    historicalDigests: {
      "docs/adr/ADR-0017-online-only-product.md": sha256(HISTORICAL_ADR_0017),
      "docs/adr/ADR-0018-mvp-posture.md": sha256(HISTORICAL_ADR_0018),
    },
    files: {
      "docs/adr/ADR-0017-online-only-product.md": HISTORICAL_ADR_0017,
      "docs/adr/ADR-0018-mvp-posture.md": HISTORICAL_ADR_0018,
      "docs/adr/ADR-0019-atomic-local-journal-media.md": currentAuthority,
      "AGENTS.md": currentAuthority,
      "docs/TECH_STACK_DECISIONS.md": currentAuthority,
      "docs/MVP_SCOPE_RECHECK_2026-07-03.md": currentAuthority,
      "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json": currentAuthority,
      "docs/SDD_VERTICAL_SLICE_ROADMAP.md": currentAuthority,
      "docs/INFRASTRUCTURE_REGISTRY.md": currentAuthority,
      "apps/web/src/lib/garden/journal-document.ts":
        "export interface JournalDocumentV1 {}",
      "apps/web/src/lib/privacy/precise-location-text.ts":
        "export const preciseLocationTextPolicy = true;",
      "apps/web/src/server/media/lifecycle-revoke.ts":
        "export const mediaRevocationOwner = true;",
      "apps/web/src/server/search/public-projection-outbox.ts":
        "export const publicProjectionIntentOwner = true;",
      "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md":
        "PUBLIC_SURFACE_INDEXABILITY_THRESHOLD",
      "docs/CURRENT_SCHEMA_ERASURE.md": "Data-subject erasure authority",
    },
  };
}

describe("verify-atomic-journal-media-canon", () => {
  it("accepts one complete owner graph and proves deterministic replay", () => {
    const input = alignedInput();
    const first = evaluateAtomicJournalMediaCanon(input);
    const second = evaluateAtomicJournalMediaCanon(input);

    expect(first).toMatchObject({
      version: ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
      status: "aligned",
      violations: [],
      baselineSha: input.baselineSha,
    });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.scannedFiles).toBe(Object.keys(input.files).length);

    const formatted = JSON.parse(formatAtomicJournalMediaCanonReceipt(first));
    expect(formatted).toMatchObject({
      version: ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
      status: "aligned",
      digest: first.digest,
    });
    expect(JSON.stringify(formatted)).not.toContain(
      "ADR-0017 immutable historical body",
    );
  });

  it("treats Markdown emphasis and line wrapping as presentation only", () => {
    const input = alignedInput();
    input.files["docs/adr/ADR-0019-atomic-local-journal-media.md"] =
      input.files["docs/adr/ADR-0019-atomic-local-journal-media.md"]
        .replace(
          "browser-generated WebP is the sole final artifact",
          "**browser-generated WebP is the sole final**\n**artifact**",
        )
        .replace(
          "image bytes never traverse a Vercel Function",
          "image bytes never traverse\na Vercel Function",
        );

    expect(evaluateAtomicJournalMediaCanon(input)).toMatchObject({
      status: "aligned",
      violations: [],
    });
  });

  it("rejects an active server-draft/server-final-media contradiction", () => {
    const input = alignedInput();
    input.files["AGENTS.md"] +=
      "\nCurrent target requires server-authoritative drafts and server re-encoding of every final image.";

    const receipt = evaluateAtomicJournalMediaCanon(input);

    expect(receipt.status).toBe("contradiction");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "active_atomic_media_contradiction",
          path: "AGENTS.md",
        }),
      ]),
    );
  });

  it.each([
    "Current target sends image bytes through a Vercel Function.",
    "Current target continues background upload after tab closure.",
    "Current target publishes a pending-media card before every image is ready.",
    "Current target creates a private journal record before Publish.",
  ])("rejects the active atomic-publication contradiction: %s", (statement) => {
    const input = alignedInput();
    input.files["docs/TECH_STACK_DECISIONS.md"] += `\n${statement}`;

    const receipt = evaluateAtomicJournalMediaCanon(input);

    expect(receipt.status).toBe("contradiction");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "active_atomic_media_contradiction",
          path: "docs/TECH_STACK_DECISIONS.md",
        }),
      ]),
    );
  });

  it("rejects a missing child DAG and missing preserved controls", () => {
    const input = alignedInput();
    input.files["docs/SDD_VERTICAL_SLICE_ROADMAP.md"] = input.files[
      "docs/SDD_VERTICAL_SLICE_ROADMAP.md"
    ].replace(" -> OVE-349", "");
    delete input.files["apps/web/src/server/media/lifecycle-revoke.ts"];

    const receipt = evaluateAtomicJournalMediaCanon(input);

    expect(receipt.status).toBe("missing_owner");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_child_dag" }),
        expect.objectContaining({
          code: "missing_preserved_owner",
          path: "apps/web/src/server/media/lifecycle-revoke.ts",
        }),
      ]),
    );
  });

  it("rejects missing registration in the online-only canon guardrail", () => {
    const input = alignedInput();
    delete input.files["docs/ONLINE_ONLY_CANON_CLASSIFICATION.json"];

    const receipt = evaluateAtomicJournalMediaCanon(input);

    expect(receipt.status).toBe("missing_owner");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_authority_path",
          path: "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json",
        }),
      ]),
    );
  });

  it("keeps historical ADR-0017 and ADR-0018 immutable and reports stale read-back", () => {
    const input = alignedInput();
    input.files["docs/adr/ADR-0017-online-only-product.md"] += " changed";

    const receipt = evaluateAtomicJournalMediaCanon(input);

    expect(receipt.status).toBe("stale_readback");
    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "historical_adr_digest_mismatch",
          path: "docs/adr/ADR-0017-online-only-product.md",
        }),
      ]),
    );
  });

  it("times out and cancels without admitting late evidence or writing files", () => {
    const input = alignedInput();
    const timedOut = evaluateAtomicJournalMediaCanon(input, {
      deadlineMs: 1,
      now: (() => {
        let call = 0;
        return () => (call++ === 0 ? 0 : 2);
      })(),
    });
    const controller = new AbortController();
    controller.abort();
    const cancelled = evaluateAtomicJournalMediaCanon(input, {
      signal: controller.signal,
    });

    expect(timedOut).toMatchObject({
      status: "timed_out",
      violations: [{ code: "canon_file_read_timeout" }],
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      violations: [{ code: "canon_scan_cancelled" }],
    });
    expect(timedOut.scannedFiles).toBe(0);
    expect(cancelled.scannedFiles).toBe(0);
  });

  it("checks the checked-in repository inside the thirty-second contract", () => {
    const receipt = runAtomicJournalMediaCanonVerification({
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(receipt.status).toBe("aligned");
    expect(receipt.durationMs).toBeLessThanOrEqual(
      ATOMIC_JOURNAL_MEDIA_CANON_DEADLINE_MS,
    );
    expect(receipt.baselineSha).toMatch(/^[a-f0-9]{40}$/);
  });
});
