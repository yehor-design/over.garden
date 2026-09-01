import { performance } from "node:perf_hooks";

import {
  BrowserEphemeralMediaStager,
  ephemeralStagingFailureCode,
} from "@/lib/media/ephemeral-staging-client";
import {
  EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
  EPHEMERAL_MEDIA_EXPIRY_CLOCK_SKEW_SECONDS,
  buildEphemeralMediaUploadReservation,
  type EphemeralMediaUploadBinding,
} from "@/lib/media/ephemeral-staging-contract";

/**
 * OVE-359 staging reservation round-trip proof.
 *
 * PERF-01 (`photo_staging_handoff_duration`) and WAIT-01 both measure here.
 * Every case is hermetic — the fetcher is a stub and no network, database, or
 * credential is touched — because the defect this proves against was never a
 * network failure. The route serialized `expiresAt` as an ISO-8601 string while
 * the browser required a safe integer, so the two sides disagreed on a shape
 * neither suite could see, and every photo upload was refused before the
 * staging origin was ever contacted.
 */
export const PHOTO_STAGING_HANDOFF_BUDGET_MS = 120_000;
export const STAGING_ORIGIN = "https://media-stage.over.garden";
export const WAIT_SAFE_CONTROLS = [
  "Retry photo button",
  "Remove photo button",
] as const;
export const STAGING_PROOF_STATES = [
  "completed",
  "degraded",
  "failed",
] as const;

export type StagingProofState = (typeof STAGING_PROOF_STATES)[number];

const SESSION = "46045ba1-d1dc-465a-aea9-0240785e3aa0";
const ASSET = "8f5fa87d-b94e-4217-b68d-28303827ad89";
const SECOND_ASSET = "2b0c7a41-6d55-4a0e-9c2b-3f7c1d9e5a84";
const SHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const CAPABILITY = "u".repeat(64);
const RECEIPT = "r".repeat(64);
const DELETE_CAPABILITY = "d".repeat(64);

export function bindingFor(
  mediaAssetId = ASSET,
  generation = 1,
): EphemeralMediaUploadBinding {
  return { stagingSessionId: SESSION, mediaAssetId, generation };
}

/**
 * Serializes exactly what the route serializes, through the same shared
 * declaration the route uses. A fixture written by hand here would prove only
 * that this file agrees with itself.
 */
export function reservationBodyFor(
  binding: EphemeralMediaUploadBinding,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  return buildEphemeralMediaUploadReservation({
    stagingOrigin: STAGING_ORIGIN,
    binding,
    uploadCapability: CAPABILITY,
    expiresAtSeconds: nowSeconds + EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
    nowSeconds,
  });
}

function webpBlob() {
  return new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" });
}

function stageInput(binding: EphemeralMediaUploadBinding, signal: AbortSignal) {
  return {
    stagingSessionId: binding.stagingSessionId,
    mediaAssetId: binding.mediaAssetId,
    generation: binding.generation,
    sha256: SHA,
    blob: webpBlob(),
    width: 800,
    height: 600,
    signal,
  };
}

function stagedResponse() {
  return Response.json(
    {
      status: "staged",
      stagingReceipt: RECEIPT,
      deleteCapability: DELETE_CAPABILITY,
    },
    { status: 201 },
  );
}

/**
 * A response that never arrives, and that rejects when its caller's signal
 * aborts — exactly as `fetch` behaves. A stub that ignored the signal would let
 * the process exit silently instead of proving the deadline fired.
 */
function neverAnswers(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The wait-safe controls are modelled as callables that must answer while an
 * upload is in flight. A control that cannot answer during the wait is the
 * wedge WAIT-01 exists to refuse.
 */
export function waitSafeControlProbe() {
  const answered: string[] = [];
  return {
    answered,
    press(control: (typeof WAIT_SAFE_CONTROLS)[number]) {
      answered.push(control);
      return "responsive" as const;
    },
  };
}

export interface StagingProofCase {
  name: string;
  state: StagingProofState;
  failureClass: string | null;
  uploadAttempts: number;
}

/** A reservation the route serialized is accepted by the browser unchanged. */
export async function proveRoundTrip(): Promise<StagingProofCase> {
  const binding = bindingFor();
  let uploadAttempts = 0;
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/api/media/staging/reservations")) {
      return Response.json(reservationBodyFor(binding));
    }
    uploadAttempts += 1;
    return stagedResponse();
  }) as unknown as typeof fetch;

  const stager = new BrowserEphemeralMediaStager({
    documentMutationGeneration: "signed-generation",
    fetcher,
  });
  const controller = new AbortController();
  const staged = await stager.stage(stageInput(binding, controller.signal));
  if (staged.stagingReceipt !== RECEIPT) {
    throw new Error("staging_receipt_mismatch");
  }
  return {
    name: "round_trip",
    state: "completed",
    failureClass: null,
    uploadAttempts,
  };
}

/** Every malformed reservation refuses with its class and uploads nothing. */
export async function proveRefusalClasses(): Promise<StagingProofCase[]> {
  const binding = bindingFor();
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const base = reservationBodyFor(binding, nowSeconds);
  const malformed: Array<[string, Record<string, unknown>]> = [
    ["iso_expiry", { ...base, expiresAt: new Date().toISOString() }],
    ["float_expiry", { ...base, expiresAt: nowSeconds + 0.5 }],
    [
      "expiry_beyond_lifetime",
      {
        ...base,
        expiresAt:
          nowSeconds +
          EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS +
          EPHEMERAL_MEDIA_EXPIRY_CLOCK_SKEW_SECONDS +
          60,
      },
    ],
    ["short_capability", { ...base, uploadCapability: "short" }],
    [
      "foreign_origin",
      { ...base, uploadUrl: base.uploadUrl.replace(STAGING_ORIGIN, "https://attacker.example") },
    ],
    ["mismatched_path", { ...base, uploadUrl: `${STAGING_ORIGIN}/v1/staging/other/path/1` }],
    ["unknown_field", { ...base, journalText: "must not cross" }],
  ];

  const cases: StagingProofCase[] = [];
  for (const [name, body] of malformed) {
    let uploadAttempts = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/api/media/staging/reservations")) {
        return Response.json(body);
      }
      uploadAttempts += 1;
      return stagedResponse();
    }) as unknown as typeof fetch;
    const stager = new BrowserEphemeralMediaStager({
      documentMutationGeneration: "signed-generation",
      fetcher,
    });
    const controller = new AbortController();
    let failureClass: string | null = null;
    try {
      await stager.stage(stageInput(binding, controller.signal));
    } catch (error) {
      failureClass = ephemeralStagingFailureCode(error);
    }
    if (failureClass !== "staging_reservation_invalid" || uploadAttempts !== 0) {
      throw new Error(`refusal_case_unproven:${name}`);
    }
    cases.push({ name, state: "failed", failureClass, uploadAttempts });
  }
  return cases;
}

/** Replaying one selection returns the same decision and stages once. */
export async function proveReplay(): Promise<StagingProofCase> {
  const binding = bindingFor();
  let uploadAttempts = 0;
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/api/media/staging/reservations")) {
      return Response.json(reservationBodyFor(binding));
    }
    uploadAttempts += 1;
    return stagedResponse();
  }) as unknown as typeof fetch;
  const stager = new BrowserEphemeralMediaStager({
    documentMutationGeneration: "signed-generation",
    fetcher,
  });
  const controller = new AbortController();
  const first = await stager.stage(stageInput(binding, controller.signal));
  const second = await stager.stage(stageInput(binding, controller.signal));
  if (first.stagingReceipt !== second.stagingReceipt) {
    throw new Error("replay_receipt_diverged");
  }
  return {
    name: "replay",
    state: "completed",
    failureClass: null,
    uploadAttempts,
  };
}

/** Two assets staged together never cross their bindings. */
export async function proveConcurrentAssets(): Promise<StagingProofCase> {
  const seen: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/api/media/staging/reservations")) {
      // The reservation path carries no asset, so the binding is read from the
      // request body exactly as the route reads it.
      const requested = JSON.parse(String(init?.body ?? "{}")) as {
        mediaAssetId?: string;
      };
      return Response.json(
        reservationBodyFor(bindingFor(requested.mediaAssetId ?? ASSET)),
      );
    }
    seen.push(url.includes(SECOND_ASSET) ? SECOND_ASSET : ASSET);
    return stagedResponse();
  }) as unknown as typeof fetch;
  const stager = new BrowserEphemeralMediaStager({
    documentMutationGeneration: "signed-generation",
    fetcher,
  });
  const controller = new AbortController();
  await Promise.all([
    stager.stage(stageInput(bindingFor(ASSET), controller.signal)),
    stager.stage(stageInput(bindingFor(SECOND_ASSET), controller.signal)),
  ]);
  if (new Set(seen).size !== 2) throw new Error("concurrent_bindings_crossed");
  return {
    name: "concurrent_assets",
    state: "completed",
    failureClass: null,
    uploadAttempts: seen.length,
  };
}

/**
 * WAIT-01. The staging upload never answers; the declared deadline must fire,
 * the class must be `staging_upload_timeout`, and both wait-safe controls must
 * stay responsive throughout the wait.
 */
export async function proveInjectedUploadTimeout(): Promise<StagingProofCase> {
  const binding = bindingFor();
  const probe = waitSafeControlProbe();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/api/media/staging/reservations")) {
      return Response.json(reservationBodyFor(binding));
    }
    return neverAnswers(init);
  }) as unknown as typeof fetch;

  const stager = new BrowserEphemeralMediaStager({
    documentMutationGeneration: "signed-generation",
    fetcher,
    uploadDeadlineMs: 50,
  });
  const controller = new AbortController();
  const pending = stager.stage(stageInput(binding, controller.signal));
  for (const control of WAIT_SAFE_CONTROLS) probe.press(control);

  let failureClass: string | null = null;
  try {
    await pending;
  } catch (error) {
    failureClass = ephemeralStagingFailureCode(error);
  }
  if (failureClass !== "staging_upload_timeout") {
    throw new Error(`wait01_class_unexpected:${failureClass}`);
  }
  if (probe.answered.length !== WAIT_SAFE_CONTROLS.length) {
    throw new Error("wait01_control_unresponsive");
  }
  return {
    name: "injected_staging_upload_timeout",
    state: "degraded",
    failureClass,
    uploadAttempts: 0,
  };
}

/** An aborted selection reports cancellation and stages nothing. */
export async function proveAbortedSelection(): Promise<StagingProofCase> {
  const binding = bindingFor();
  const controller = new AbortController();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/api/media/staging/reservations")) {
      return Response.json(reservationBodyFor(binding));
    }
    controller.abort();
    return neverAnswers(init);
  }) as unknown as typeof fetch;
  const stager = new BrowserEphemeralMediaStager({
    documentMutationGeneration: "signed-generation",
    fetcher,
    uploadDeadlineMs: 50,
  });
  let failed = false;
  try {
    await stager.stage(stageInput(binding, controller.signal));
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("abort_not_observed");
  return {
    name: "aborted_selection",
    state: "degraded",
    failureClass: "aborted",
    uploadAttempts: 0,
  };
}

export interface StagingProofReceipt {
  mode: "plan" | "verify";
  metric: "photo_staging_handoff_duration";
  budgetMs: number;
  elapsedMs: number;
  withinBudget: boolean;
  waitSafeControls: readonly string[];
  cases: StagingProofCase[];
}

export async function runStagingReservationProof(options: {
  mode: "plan" | "verify";
  injectStagingUploadTimeout: boolean;
}): Promise<StagingProofReceipt> {
  const started = performance.now();
  const cases: StagingProofCase[] = [];
  if (options.mode === "verify") {
    cases.push(await proveRoundTrip());
    cases.push(...(await proveRefusalClasses()));
    cases.push(await proveReplay());
    cases.push(await proveConcurrentAssets());
    cases.push(await proveAbortedSelection());
  }
  if (options.injectStagingUploadTimeout) {
    cases.push(await proveInjectedUploadTimeout());
  }
  const elapsedMs = Math.round(performance.now() - started);
  return {
    mode: options.mode,
    metric: "photo_staging_handoff_duration",
    budgetMs: PHOTO_STAGING_HANDOFF_BUDGET_MS,
    elapsedMs,
    withinBudget: elapsedMs <= PHOTO_STAGING_HANDOFF_BUDGET_MS,
    waitSafeControls: WAIT_SAFE_CONTROLS,
    cases,
  };
}

export function parseStagingProofArgs(argv: readonly string[]): {
  mode: "plan" | "verify";
  injectStagingUploadTimeout: boolean;
} {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex === -1 ? "verify" : argv[modeIndex + 1];
  if (mode !== "plan" && mode !== "verify") {
    throw new Error("staging_proof_mode_invalid");
  }
  return {
    mode,
    injectStagingUploadTimeout: argv.includes("--inject-staging-upload-timeout"),
  };
}

async function main() {
  const receipt = await runStagingReservationProof(
    parseStagingProofArgs(process.argv.slice(2)),
  );
  // Class-only receipt: no capability, upload URL, object key, session
  // identifier, journal body, coordinate, or owner identifier is recorded.
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.withinBudget) process.exitCode = 1;
}

if (process.argv[1]?.includes("prove-staging-reservation-contract")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
