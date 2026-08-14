import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EVIDENCE_CLASSES = [
  "playwright_webkit_iphone_profile",
  "playwright_chromium_pixel_profile",
  "android_emulator_chrome_talkback_ax_tree",
] as const;
const ACCEPTED_RESIDUAL_RISKS = [
  "no_physical_ios_hardware",
  "no_physical_android_hardware",
  "no_voiceover_runtime",
  "android_system_chrome_not_current_stable",
] as const;
const PRIVACY_FIELDS = [
  "journalText",
  "links",
  "blockOrMediaIds",
  "identity",
  "preciseLocation",
  "filenames",
  "userAgent",
] as const;

type JsonObject = Record<string, unknown>;

export interface ValidatedDeviceEquivalentAuthorization {
  sha256: string;
  authorizedDate: string;
  evidenceClasses: typeof EVIDENCE_CLASSES;
  acceptedResidualRisks: typeof ACCEPTED_RESIDUAL_RISKS;
}

export function readAndValidateDeviceEquivalentAuthorization(
  authorizationPath: string,
): ValidatedDeviceEquivalentAuthorization {
  const bytes = readFileSync(authorizationPath);
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  const validated = validateDeviceEquivalentAuthorization(value);
  return {
    ...validated,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function validateDeviceEquivalentAuthorization(
  value: unknown,
): Omit<ValidatedDeviceEquivalentAuthorization, "sha256"> {
  const root = requireObject(value, "authorization");
  requireExactKeys(root, [
    "schemaVersion",
    "issue",
    "authorizedAt",
    "authorizedBy",
    "attestation",
    "reason",
    "evidenceClasses",
    "acceptedResidualRisks",
    "privacy",
  ]);
  requireEqual(
    root.schemaVersion,
    "overgarden.ove317.device-equivalent-authorization.v1",
    "schemaVersion",
  );
  requireEqual(root.issue, "OVE-317", "issue");
  requireEqual(root.authorizedBy, "maintainer", "authorizedBy");
  requireEqual(
    root.attestation,
    "maintainer_authorized_alternative_testing",
    "attestation",
  );
  requireEqual(root.reason, "physical_ios_and_android_unavailable", "reason");

  if (
    typeof root.authorizedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      root.authorizedAt,
    ) ||
    Number.isNaN(Date.parse(root.authorizedAt))
  ) {
    throw new Error("authorizedAt must be a UTC ISO timestamp.");
  }

  requireExactArray(root.evidenceClasses, EVIDENCE_CLASSES, "evidenceClasses");
  requireExactArray(
    root.acceptedResidualRisks,
    ACCEPTED_RESIDUAL_RISKS,
    "acceptedResidualRisks",
  );

  const privacy = requireObject(root.privacy, "privacy");
  requireExactKeys(privacy, PRIVACY_FIELDS);
  for (const field of PRIVACY_FIELDS) {
    requireEqual(privacy[field], false, `privacy.${field}`);
  }

  return {
    authorizedDate: root.authorizedAt.slice(0, 10),
    evidenceClasses: EVIDENCE_CLASSES,
    acceptedResidualRisks: ACCEPTED_RESIDUAL_RISKS,
  };
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function requireExactKeys(
  value: JsonObject,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\n") !== wanted.join("\n")) {
    throw new Error(
      `Unexpected fields; expected ${wanted.join(", ")}, received ${actual.join(", ")}.`,
    );
  }
}

function requireExactArray(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(`${label} has an invalid value.`);
  }
}

function requireEqual(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} has an invalid value.`);
  }
}
