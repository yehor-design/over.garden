import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  runRetirementScanWithReceipt,
  settleScanWithinDeadline,
  verifyFacebookLoginRetirement,
} from "./verify-facebook-login-retirement";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

describe("FacebookSurfaceRetirementReceiptV1", () => {
  it("proves an empty runtime/current-doc inventory and preserved boundaries", async () => {
    const receipt = await verifyFacebookLoginRetirement({
      root: process.cwd(),
      sha: "a".repeat(40),
      deploymentClass: "test_fixture",
    });

    expect(receipt).toMatchObject({
      version: 1,
      issue: "OVE-296",
      resultClass: "removed",
      failureClass: "none",
      runtimeReferenceCount: 0,
      currentDocReferenceCount: 0,
      providerRegistrationClass: "google_only_no_retired_provider_module",
      GoogleCredentialRegressionClass: "credential_and_google_preserved",
      MetaAdsUnchangedClass: "unchanged_from_ove296_baseline",
      sha: "a".repeat(40),
      deploymentClass: "test_fixture",
      evidenceSafety: "counts_digests_and_classes_only",
    });
    expect(receipt.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.scanDurationMs).toBeLessThanOrEqual(30_000);
    expect(JSON.stringify(receipt)).not.toMatch(
      /secret|token|cookie|email@|client[_-]?id/i,
    );
  });

  it("returns a bounded inconclusive receipt without wedging email or Google controls", async () => {
    vi.useFakeTimers();
    try {
      const pending = runRetirementScanWithReceipt({
        operation: (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
        sha: "d".repeat(40),
        deploymentClass: "timeout_fixture",
        deadlineMs: 30_000,
        now: () => Date.now(),
      });

      const { GardenAuthPanel } =
        await import("@/app/garden/garden-auth-panel");
      const html = renderToStaticMarkup(
        createElement(GardenAuthPanel, {
          googleSignInEnabled: true,
          locale: "uk",
        }),
      );
      expect(html).toContain('type="email"');
      const emailSubmit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
      const googleSubmit = html.match(
        /<button[^>]*data-testid="google-sign-in-button"[^>]*>/,
      )?.[0];
      expect(emailSubmit).toBeDefined();
      expect(googleSubmit).toBeDefined();
      expect(emailSubmit).not.toMatch(/\sdisabled(?:=|\s|>)/);
      expect(googleSubmit).not.toMatch(/\sdisabled(?:=|\s|>)/);

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toMatchObject({
        resultClass: "inconclusive",
        failureClass: "deadline",
        scanDurationMs: 30_000,
        sourceDigest: null,
        runtimeReferenceCount: null,
        currentDocReferenceCount: null,
        sha: "d".repeat(40),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a delayed scan at a finite deadline and settles once", async () => {
    vi.useFakeTimers();
    const settleSpy = vi.fn();
    const pending = settleScanWithinDeadline(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
      30,
    ).then(settleSpy, (error) => {
      settleSpy(error);
      throw error;
    });

    const rejection = expect(pending).rejects.toThrow("exceeded 30ms");
    await vi.advanceTimersByTimeAsync(30);
    await rejection;
    expect(settleSpy).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("rejects non-canonical receipt identity before scanning", async () => {
    await expect(
      verifyFacebookLoginRetirement({
        root: process.cwd(),
        sha: "branch-head",
      }),
    ).rejects.toThrow("exact lowercase Git SHA");
    await expect(
      verifyFacebookLoginRetirement({
        root: process.cwd(),
        sha: "c".repeat(40),
        deploymentClass: "READY; token=unsafe",
      }),
    ).rejects.toThrow("deployment class is invalid");
  });
});
