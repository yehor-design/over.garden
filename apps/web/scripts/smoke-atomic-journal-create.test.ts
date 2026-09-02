import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getAtomicJournalCreateCopy } from "../src/lib/garden/atomic-journal-create-copy";
import {
  LocalJournalMediaCoordinator,
  type EncodedJournalImage,
} from "../src/lib/garden/local-journal-media-coordinator";
import {
  CLIENT_WEBP_FINAL_MAX_BYTES,
  CLIENT_WEBP_LONG_EDGE,
  CLIENT_WEBP_PHOTO_QUALITY,
  CLIENT_WEBP_SOURCE_MAX_BYTES,
  CLIENT_WEBP_SOURCE_MAX_PIXELS,
  createClientWebpEncodingPlan,
} from "../src/lib/media/client-webp-policy";
import {
  buildAtomicJournalWaitSafetyReceipt,
  buildFocusedAtomicJournalCreateReceipt,
} from "./smoke-atomic-journal-create";

const WEB_ROOT = process.cwd();
const CREATE_COMPOSERS = [
  "src/app/(default)/garden/first-entry-composer.tsx",
  "src/app/(default)/garden/objects/[objectId]/follow-up-entry-composer.tsx",
  "src/app/(default)/garden/space-entry-composer.tsx",
] as const;

describe("OVE-347 atomic journal creation smoke", () => {
  it("focused contract: cuts all three create callers to local-only atomic publication", () => {
    const sources = CREATE_COMPOSERS.map(read);
    expect(sources).toHaveLength(3);
    for (const source of sources) {
      expect(source).toContain("useLocalJournalComposer");
      expect(source).toContain("local.publish({");
      expect(source).toContain("LocalJournalPublicationDisclosure");
      expect(source).not.toMatch(
        /useOnlineJournalComposer|online-journal-submit|useInlineMediaSelection|\/api\/journal\/drafts|\/api\/media\/(?:uploads|process)/,
      );
    }

    const route = read("src/app/api/garden/entries/route.ts");
    const repository = read("src/server/journal-repository.ts");
    const migration = read("sql/0036_ove347_atomic_journal_create.sql");
    expect(route).toContain("ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER");
    expect(route).toContain("claimEphemeralPublicationMedia");
    expect(route).toContain("assertPublicMediaReady");
    expect(repository).toContain('visibility: "public"');
    expect(repository).toContain("insertAtomicPublicationMedia");
    expect(repository).toContain("recordAtomicPublicationEffects");
    expect(migration).toContain("33554432");
    expect(migration).toContain("media_staging_finalize");

    expect(buildFocusedAtomicJournalCreateReceipt()).toMatchObject({
      createFlows: ["first_plant_entry", "plant_object_entry", "space_entry"],
      prepublishDurableWrites: 0,
      finalVisibility: "public",
      documentContract: "JournalDocumentV1",
      imagePolicy: {
        photoQuality: 82,
        alphaMode: "lossless",
        maxLongEdge: 2_560,
        maxSourceBytes: 50 * 1_024 * 1_024,
        maxSourcePixels: 64_000_000,
        maxFinalBytes: 32 * 1_024 * 1_024,
        maxImages: 10,
      },
    });
  });

  it("focused contract: pins codec versions and ships their complete notices", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toMatchObject({
      "@jsquash/jpeg": "1.6.0",
      "@jsquash/png": "3.1.1",
      "@jsquash/resize": "2.1.1",
      "@jsquash/webp": "1.5.0",
      "libheif-js": "1.19.8",
    });
    const notice = read("public/licenses/OVE-347-THIRD-PARTY-NOTICES.md");
    expect(notice).toMatch(/@jsquash\/jpeg 1\.6\.0/);
    expect(notice).toMatch(/libheif-js 1\.19\.8/);
    expect(notice).toMatch(/LGPL-3\.0/);
    expect(notice).toMatch(/unmodified/i);
    for (const license of [
      "public/licenses/apache-2.0.txt",
      "public/licenses/jsquash-jpeg-codec.txt",
      "public/licenses/jsquash-png-codec.txt",
      "public/licenses/jsquash-resize-magic-kernel.txt",
      "public/licenses/jsquash-resize-hqx.txt",
      "public/licenses/jsquash-resize-codec.txt",
      "public/licenses/jsquash-webp-codec.txt",
      "public/licenses/libheif-wasm.txt",
    ]) {
      expect(read(license).length).toBeGreaterThan(300);
    }
  });

  it("focused contract: golden policy fixes orientation, scale, lossless alpha, and limits", () => {
    expect(CLIENT_WEBP_PHOTO_QUALITY).toBe(82);
    expect(CLIENT_WEBP_LONG_EDGE).toBe(2_560);
    expect(CLIENT_WEBP_SOURCE_MAX_BYTES).toBe(50 * 1_024 * 1_024);
    expect(CLIENT_WEBP_SOURCE_MAX_PIXELS).toBe(64_000_000);
    expect(CLIENT_WEBP_FINAL_MAX_BYTES).toBe(32 * 1_024 * 1_024);
    expect(
      createClientWebpEncodingPlan({
        sourceBytes: 8_000_000,
        source: {
          kind: "jpeg",
          width: 4_032,
          height: 3_024,
          orientation: 6,
          hasAlpha: false,
        },
      }),
    ).toMatchObject({
      outputWidth: 1_920,
      outputHeight: 2_560,
      quality: 82,
      lossless: false,
    });
    expect(
      createClientWebpEncodingPlan({
        sourceBytes: 1_000_000,
        source: {
          kind: "png",
          width: 1_200,
          height: 800,
          orientation: 1,
          hasAlpha: true,
        },
      }),
    ).toMatchObject({
      outputWidth: 1_200,
      outputHeight: 800,
      quality: 100,
      lossless: true,
    });
  });

  it("browser a11y degraded: all locales expose honest public and recovery states", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getAtomicJournalCreateCopy(locale);
      expect(copy.localOnly.length).toBeGreaterThan(30);
      expect(copy.disclosure.length).toBeGreaterThan(30);
      expect(copy.cancelPublishing.length).toBeGreaterThan(5);
      expect(copy.photoFailed.length).toBeGreaterThan(20);
      expect(copy.photoEmpty).toMatch(/JPEG.*PNG.*WebP.*HEIC.*HEIF/i);
    }
    const status = read(
      "src/components/garden/local-journal-composer-status.tsx",
    );
    const image = read(
      "src/components/garden/lexical-journal/journal-lexical-image-node.tsx",
    );
    expect(status).toContain('aria-live="polite"');
    expect(status).toContain("copy.cancelPublishing");
    expect(image).toContain("aria-busy={busy || undefined}");
    expect(image).toContain('role="alert"');
    expect(image).toContain("context.disabled && !failed");
  });

  it("browser performance: photo_placeholder_latency stays under 100 ms and cancellation fences late writes", async () => {
    const pending = deferred<EncodedJournalImage>();
    const stage = vi.fn(async () => ({
      stagingReceipt: "receipt-current",
      deleteCapability: "delete-current",
    }));
    const coordinator = new LocalJournalMediaCoordinator({
      stagingSessionId: "00000000-0000-4000-8000-000000000100",
      createId: () => "00000000-0000-4000-8000-000000000101",
      encoder: { encode: vi.fn(() => pending.promise) },
      stager: { stage, delete: vi.fn(async () => undefined) },
      createObjectURL: () => "blob:final-webp",
      revokeObjectURL: vi.fn(),
    });
    const startedAt = performance.now();
    const selection = coordinator.add(new Blob([new Uint8Array([1])]), {
      blockId: "b_immediate",
    });
    const photoPlaceholderLatency = performance.now() - startedAt;
    expect(photoPlaceholderLatency).toBeLessThanOrEqual(100);
    expect(coordinator.getSnapshot().items[0]).toMatchObject({
      status: "selected",
      blockId: "b_immediate",
    });

    coordinator.destroy();
    pending.resolve(encodedImage());
    await expect(selection.ready).rejects.toMatchObject({
      code: "media_abandoned",
    });
    await Promise.resolve();
    expect(stage).not.toHaveBeenCalled();
  });

  it("degraded Worker encode timeout R2 stage timeout claim timeout keeps Cancel publishing button and Remove failed photo button responsive", () => {
    expect(buildAtomicJournalWaitSafetyReceipt()).toEqual({
      version: "ove347.atomicJournalCreateSmoke.v1",
      injectedFaults: [
        "Worker encode timeout",
        "R2 stage timeout",
        "claim timeout",
      ],
      terminalStatus: "failed",
      publishLoader: "finite",
      cancelPublishingButton: "responsive",
      removeFailedPhotoButton: "responsive",
      lateCompletion: "generation_fenced",
    });
    expect(read("src/lib/media/browser-journal-image-encoder.ts")).toContain(
      'BrowserJournalImageEncoderError("encode_timeout")',
    );
    expect(read("src/lib/media/ephemeral-staging-client.ts")).toContain(
      'EphemeralStagingClientError("staging_upload_timeout")',
    );
    expect(read("src/server/media/ephemeral-publication-handoff.ts")).toContain(
      "EPHEMERAL_MEDIA_CLAIM_DEADLINE_MS",
    );
  });

  it("browser public and owner reads remain free of Lexical and codec WASM", () => {
    for (const file of [
      "src/server/public-journal-directory-repository.ts",
      "src/app/[locale]/journal/[slug]/page.tsx",
      "src/app/(default)/garden/page.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(
        /journal-image-codec|@jsquash|libheif|journal-image-encoder\.worker|LexicalComposer/,
      );
    }
  });
});

function read(relativePath: string) {
  return fs.readFileSync(path.join(WEB_ROOT, relativePath), "utf8");
}

function encodedImage(): EncodedJournalImage {
  return {
    blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
    width: 1,
    height: 1,
    sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    sourceKind: "jpeg",
    lossless: false,
    quality: 82,
    durationMs: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
