import { describe, expect, it, vi } from "vitest";

import {
  assertLocalEppoCaptureEnvironment,
  buildEppoEndpointUrl,
  checkpointableErrorClass,
  parseEppoCaptureOptions,
  requestEppoJson,
  runEppoTimeoutFixture,
  staleClaimRecoveryIsDue,
} from "./capture-eppo-observed-snapshot";

const baseArgs = [
  "--mode",
  "plan",
  "--environment",
  "local",
  "--confirm-environment",
  "local",
  "--concurrency",
  "1",
  "--request-timeout-ms",
  "15000",
  "--max-attempts",
  "2",
];

describe("EPPO observed capture command", () => {
  it("accepts only the exact bounded local operator contract", () => {
    expect(parseEppoCaptureOptions(baseArgs)).toMatchObject({
      mode: "plan",
      environment: "local",
      confirmEnvironment: "local",
      concurrency: 1,
      requestTimeoutMs: 15_000,
      maxAttempts: 2,
    });

    for (const invalid of [
      baseArgs.with(3, "production"),
      baseArgs.with(5, "production"),
      baseArgs.with(7, "2"),
      baseArgs.with(9, "15001"),
      baseArgs.with(11, "3"),
      [...baseArgs, "--source-host", "example.invalid"],
    ]) {
      expect(() => parseEppoCaptureOptions(invalid)).toThrow();
    }
  });

  it("refuses a non-loopback database even when the environment flags say local", () => {
    const options = parseEppoCaptureOptions(baseArgs);
    expect(() =>
      assertLocalEppoCaptureEnvironment(options, {
        DATABASE_URL: "postgresql://fixture@db.example.invalid/overgarden",
      }),
    ).toThrow("non_local_database_refused");
    expect(
      assertLocalEppoCaptureEnvironment(options, {
        DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/overgarden_fixture",
      }),
    ).toEqual({ databaseHost: "loopback", environment: "local" });
  });

  it("constructs only the three documented detail endpoint URLs", () => {
    expect(buildEppoEndpointUrl("ABCD01", "taxon_overview")).toBe(
      "https://api.eppo.int/gd/v2/taxons/taxon/ABCD01/overview",
    );
    expect(buildEppoEndpointUrl("ABCD01", "taxon_names")).toBe(
      "https://api.eppo.int/gd/v2/taxons/taxon/ABCD01/names",
    );
    expect(buildEppoEndpointUrl("ABCD01", "taxon_taxonomy")).toBe(
      "https://api.eppo.int/gd/v2/taxons/taxon/ABCD01/taxonomy",
    );
    expect(() =>
      buildEppoEndpointUrl("../../secret", "taxon_overview"),
    ).toThrow("invalid_eppo_code");
    expect(() => buildEppoEndpointUrl("A/A:A/A", "taxon_overview")).toThrow(
      "invalid_eppo_code",
    );
  });

  it("classifies a timed-out request without accepting its late payload", async () => {
    let lateCompletion = false;
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              lateCompletion = true;
              resolve(Response.json({ eppocode: "ABCD01" }));
            }, 1);
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });

    await expect(
      requestEppoJson(
        "https://api.eppo.int/gd/v2/taxons/taxon/ABCD01/overview",
        "fixture-secret-never-rendered",
        { timeoutMs: 5, fetch: fetcher },
      ),
    ).rejects.toMatchObject({ code: "request_timeout" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(lateCompletion).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("emits a bounded redacted timeout fixture with usable controls", async () => {
    const receipt = await runEppoTimeoutFixture({ timeoutMs: 5 });
    const serialized = JSON.stringify(receipt);

    expect(receipt).toMatchObject({
      class: "fixture",
      fixture: "timeout",
      state: "timed_out",
      providerConcurrency: 1,
      lateWriteAccepted: false,
      controls: {
        cancellation: "responsive",
        status: "responsive",
      },
    });
    expect(receipt.durationMs).toBeLessThan(1_000);
    expect(serialized).not.toContain("fixture-secret");
    expect(serialized).not.toContain("raw_payload");
  });

  it("recovers stale claims on a bounded timer without changing provider concurrency", () => {
    expect(staleClaimRecoveryIsDue(299_999, 300_000)).toBe(false);
    expect(staleClaimRecoveryIsDue(300_000, 300_000)).toBe(true);
  });

  it("checkpoints an unobserved interruption and fails closed on refused evidence", () => {
    expect(checkpointableErrorClass(new Error("capture_job_deadline"))).toBe(
      "capture_job_deadline",
    );
    expect(
      checkpointableErrorClass(new Error("capture_transport_budget_exhausted")),
    ).toBe("capture_transport_budget_exhausted");

    for (const refused of [
      "response_schema_mismatch",
      "inventory_replay_digest_mismatch",
      "authentication_rejected",
      "endpoint_units_incomplete",
    ]) {
      expect(checkpointableErrorClass(new Error(refused))).toBeNull();
    }
    expect(checkpointableErrorClass("capture_job_deadline")).toBeNull();
  });
});
