import { describe, expect, it } from "vitest";

import { validateDeviceEquivalentAuthorization } from "./lexical-journal-device-equivalent-authorization";

const EVIDENCE_CLASSES = [
  "playwright_webkit_iphone_profile",
  "playwright_chromium_pixel_profile",
  "android_emulator_chrome_talkback_ax_tree",
] as const;

const RESIDUAL_RISKS = [
  "no_physical_ios_hardware",
  "no_physical_android_hardware",
  "no_voiceover_runtime",
  "android_system_chrome_not_current_stable",
] as const;

function validAuthorization() {
  return {
    schemaVersion: "overgarden.ove317.device-equivalent-authorization.v1",
    issue: "OVE-317",
    authorizedAt: "2026-08-14T12:00:00Z",
    authorizedBy: "maintainer",
    attestation: "maintainer_authorized_alternative_testing",
    reason: "physical_ios_and_android_unavailable",
    evidenceClasses: [...EVIDENCE_CLASSES],
    acceptedResidualRisks: [...RESIDUAL_RISKS],
    privacy: {
      journalText: false,
      links: false,
      blockOrMediaIds: false,
      identity: false,
      preciseLocation: false,
      filenames: false,
      userAgent: false,
    },
  };
}

describe("OVE-317 device-equivalent authorization", () => {
  it("accepts only the exact content-free authorization and residual risks", () => {
    expect(validateDeviceEquivalentAuthorization(validAuthorization())).toEqual(
      {
        authorizedDate: "2026-08-14",
        evidenceClasses: EVIDENCE_CLASSES,
        acceptedResidualRisks: RESIDUAL_RISKS,
      },
    );
  });

  it("rejects missing risk acceptance, extra physical claims, or private evidence", () => {
    const missingRisk = validAuthorization();
    missingRisk.acceptedResidualRisks.pop();
    expect(() => validateDeviceEquivalentAuthorization(missingRisk)).toThrow(
      /acceptedResidualRisks/,
    );

    const inflated = {
      ...validAuthorization(),
      physicalDeviceCoverage: true,
    };
    expect(() => validateDeviceEquivalentAuthorization(inflated)).toThrow(
      /Unexpected fields/,
    );

    const privateEvidence = validAuthorization();
    privateEvidence.privacy.journalText = true;
    expect(() =>
      validateDeviceEquivalentAuthorization(privateEvidence),
    ).toThrow(/journalText/);
  });
});
