import { describe, expect, it } from "vitest";

import {
  OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST,
  OVE349_BRIDGE_APPLY_CONFIRMATION,
  OVE349_BRIDGE_ROLLBACK_CONFIRMATION,
  classifyBridgeDefaults,
  parseBridgeArgs,
  stableBridgeDigest,
} from "./prepare-ove349-schema-compatibility";

const priorDefaults = {
  quarantine_key: null,
  status: "'quarantined'::text",
  original_deleted_at: null,
  declared_media_type: null,
  admitted_media_type: null,
  media_readiness_state: "'legacy_non_ready'::text",
  upload_generation_id: null,
  public_object_id: null,
};

const bridgeDefaults = {
  quarantine_key:
    "('retired-compat/'::text || (gen_random_uuid())::text)",
  status: "'processed'::text",
  original_deleted_at: "now()",
  declared_media_type: "'image/webp'::text",
  admitted_media_type: "'image/webp'::text",
  media_readiness_state: "'public_ready'::text",
  upload_generation_id: "gen_random_uuid()",
  public_object_id: "gen_random_uuid()",
};

describe("OVE-349 schema compatibility bridge", () => {
  it("classifies only the exact prior and bridge default shapes", () => {
    expect(classifyBridgeDefaults(priorDefaults)).toBe("prior");
    expect(classifyBridgeDefaults(bridgeDefaults)).toBe("bridge");
    expect(
      classifyBridgeDefaults({ ...bridgeDefaults, status: "'quarantined'::text" }),
    ).toBe("drift");
  });

  it("requires exact production confirmations and digests", () => {
    expect(parseBridgeArgs(["--mode", "preflight"])).toEqual({
      mode: "preflight",
    });
    expect(
      parseBridgeArgs([
        "--mode",
        "apply",
        "--approved-schema-digest",
        OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST,
        "--confirm-production",
        OVE349_BRIDGE_APPLY_CONFIRMATION,
      ]),
    ).toMatchObject({ mode: "apply" });
    expect(() => parseBridgeArgs(["--mode", "apply"])).toThrow(
      /schema digest/i,
    );
    expect(
      parseBridgeArgs([
        "--mode",
        "rollback",
        "--bridge-receipt",
        "a".repeat(64),
        "--confirm-production",
        OVE349_BRIDGE_ROLLBACK_CONFIRMATION,
      ]),
    ).toMatchObject({ mode: "rollback" });
  });

  it("produces an order-independent redacted receipt digest", () => {
    expect(stableBridgeDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableBridgeDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
