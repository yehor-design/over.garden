import { describe, expect, it } from "vitest";

import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { ephemeralStagingFailureCode } from "@/lib/media/ephemeral-staging-client";
import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_EXPIRY_CLOCK_SKEW_SECONDS,
  buildEphemeralMediaUploadReservation,
  parseEphemeralMediaUploadReservation,
} from "@/lib/media/ephemeral-staging-contract";

import {
  PHOTO_STAGING_HANDOFF_BUDGET_MS,
  STAGING_ORIGIN,
  WAIT_SAFE_CONTROLS,
  bindingFor,
  parseStagingProofArgs,
  proveInjectedUploadTimeout,
  proveRefusalClasses,
  proveRoundTrip,
  reservationBodyFor,
  runStagingReservationProof,
} from "./prove-staging-reservation-contract";

const BINDING = bindingFor();

describe("staging reservation wire contract", () => {
  it("round-trips a route-serialized reservation through the browser parser", async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const body = reservationBodyFor(BINDING, nowSeconds);

    expect(
      parseEphemeralMediaUploadReservation(body, {
        expectedOrigin: STAGING_ORIGIN,
        binding: BINDING,
        nowSeconds,
      }),
    ).toEqual(body);

    const proof = await proveRoundTrip();
    expect(proof.state).toBe("completed");
    expect(proof.uploadAttempts).toBe(1);
  });

  it("keeps the expiry an integer inside the declared capability lifetime", () => {
    const nowSeconds = 1_777_000_000;
    const body = reservationBodyFor(BINDING, nowSeconds);

    expect(Number.isSafeInteger(body.expiresAt)).toBe(true);
    expect(body.expiresAt).toBe(
      nowSeconds + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    );
    // The historical defect in one assertion: an ISO-8601 string is refused.
    expect(
      parseEphemeralMediaUploadReservation(
        { ...body, expiresAt: new Date(body.expiresAt * 1_000).toISOString() },
        { expectedOrigin: STAGING_ORIGIN, binding: BINDING, nowSeconds },
      ),
    ).toBeNull();
  });

  it("refuses an expiry beyond the lifetime and its clock-skew allowance", () => {
    const nowSeconds = 1_777_000_000;
    const body = reservationBodyFor(BINDING, nowSeconds);
    const beyond =
      nowSeconds +
      EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS +
      EPHEMERAL_MEDIA_EXPIRY_CLOCK_SKEW_SECONDS +
      1;

    expect(
      parseEphemeralMediaUploadReservation(
        { ...body, expiresAt: beyond },
        { expectedOrigin: STAGING_ORIGIN, binding: BINDING, nowSeconds },
      ),
    ).toBeNull();
  });

  it("refuses a capability that fails the shared token shape", () => {
    const nowSeconds = 1_777_000_000;
    const body = reservationBodyFor(BINDING, nowSeconds);

    expect(
      parseEphemeralMediaUploadReservation(
        { ...body, uploadCapability: "short" },
        { expectedOrigin: STAGING_ORIGIN, binding: BINDING, nowSeconds },
      ),
    ).toBeNull();
  });

  it("refuses an upload origin outside the exact staging origin", () => {
    const nowSeconds = 1_777_000_000;
    const body = reservationBodyFor(BINDING, nowSeconds);

    expect(
      parseEphemeralMediaUploadReservation(
        {
          ...body,
          uploadUrl: body.uploadUrl.replace(
            STAGING_ORIGIN,
            "https://attacker.example",
          ),
        },
        { expectedOrigin: STAGING_ORIGIN, binding: BINDING, nowSeconds },
      ),
    ).toBeNull();
  });

  it("refuses to serialize anything its own parser would reject", () => {
    expect(() =>
      buildEphemeralMediaUploadReservation({
        stagingOrigin: STAGING_ORIGIN,
        binding: BINDING,
        uploadCapability: "short",
        expiresAtSeconds: 1_777_000_900,
        nowSeconds: 1_777_000_000,
      }),
    ).toThrow(/ephemeral_media_upload_reservation_invalid/);
  });

  it("refuses every malformed reservation with its exact class and uploads nothing", async () => {
    const cases = await proveRefusalClasses();

    expect(cases.length).toBeGreaterThanOrEqual(7);
    for (const proofCase of cases) {
      expect(proofCase.failureClass).toBe("staging_reservation_invalid");
      expect(proofCase.uploadAttempts).toBe(0);
    }
  });

  it("reports a bounded class for a staging refusal and a neutral one otherwise", () => {
    expect(ephemeralStagingFailureCode(new Error("boom"))).toBe(
      "staging_unexpected_error",
    );
    expect(ephemeralStagingFailureCode(undefined)).toBe(
      "staging_unexpected_error",
    );
  });

  it("keeps a class-only receipt with no capability, URL, or user content", async () => {
    const receipt = await runStagingReservationProof({
      mode: "verify",
      injectStagingUploadTimeout: true,
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.withinBudget).toBe(true);
    expect(receipt.elapsedMs).toBeLessThanOrEqual(
      PHOTO_STAGING_HANDOFF_BUDGET_MS,
    );
    expect(serialized).not.toContain("uuuu");
    expect(serialized).not.toContain("media-stage.over.garden");
    expect(serialized).not.toContain("/v1/staging/");
    expect(serialized).not.toContain(BINDING.stagingSessionId);
    expect(serialized).not.toContain(BINDING.mediaAssetId);
  });

  it("keeps both wait-safe controls responsive through an injected upload timeout", async () => {
    const proof = await proveInjectedUploadTimeout();

    expect(proof.state).toBe("degraded");
    expect(proof.failureClass).toBe("staging_upload_timeout");
    expect(proof.uploadAttempts).toBe(0);
    expect(WAIT_SAFE_CONTROLS).toEqual([
      "Retry photo button",
      "Remove photo button",
    ]);
  });

  it("renders the same refusal copy in every locale", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const labels = getStructuredJournalComposerLabels(locale);
      expect(labels.imageFailed.length).toBeGreaterThan(0);
      expect(labels.imageRetry.length).toBeGreaterThan(0);
      expect(labels.imageRemove.length).toBeGreaterThan(0);
      // The recorded class travels separately from the rendered sentence, so no
      // locale string may carry a machine-readable failure code.
      expect(labels.imageFailed).not.toContain("staging_");
    }
  });

  it("refuses an unknown proof mode before running anything", () => {
    expect(() => parseStagingProofArgs(["--mode", "apply"])).toThrow(
      /staging_proof_mode_invalid/,
    );
    expect(parseStagingProofArgs([])).toEqual({
      mode: "verify",
      injectStagingUploadTimeout: false,
    });
  });
});
