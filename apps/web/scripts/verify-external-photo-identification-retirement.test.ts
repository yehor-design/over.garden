import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  scanExternalPhotoIdentificationRetirement,
  verifyExternalPhotoIdentificationRetirement,
} from "./verify-external-photo-identification-retirement";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("external photo-identification retirement guard", () => {
  it("performance scan reports no active provider owner and preserves manual catalog entrypoints", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const receipt = await verifyExternalPhotoIdentificationRetirement({
      projectRoot,
    });

    expect(receipt.status).toBe("retired");
    expect(receipt.violations).toEqual([]);
    expect(receipt.preservedPaths).toEqual(
      expect.arrayContaining([
        "apps/web/src/app/garden/objects/[objectId]/catalog-resolve-control.tsx",
        "apps/web/src/app/api/garden/catalog/typeahead/route.ts",
      ]),
    );
    expect(receipt.durationMs).toBeLessThanOrEqual(30_000);
  });

  it("detects a reintroduced retired route without scanning immutable history", async () => {
    const projectRoot = await fixtureRoot();
    const retiredRoute = path.join(
      projectRoot,
      "apps/web/src/app/api/garden/plant-identification/route.ts",
    );
    await mkdir(path.dirname(retiredRoute), { recursive: true });
    await writeFile(retiredRoute, "export async function POST() {}\n", "utf8");

    const receipt = await scanExternalPhotoIdentificationRetirement({
      projectRoot,
      requirePreservedPaths: false,
    });

    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "retired_path_present",
          path: "apps/web/src/app/api/garden/plant-identification/route.ts",
        }),
      ]),
    );
  });

  it("detects retired provider owners in worker and extensionless infrastructure sources", async () => {
    const projectRoot = await fixtureRoot();
    const workerPath = path.join(projectRoot, "workers/provider_bridge.py");
    const infrastructurePath = path.join(projectRoot, "infra/provider-probe");
    await mkdir(path.dirname(workerPath), { recursive: true });
    await mkdir(path.dirname(infrastructurePath), { recursive: true });
    await writeFile(workerPath, "PLANTNET_API_KEY = 'retired'\n", "utf8");
    await writeFile(infrastructurePath, "call-plantnet\n", "utf8");

    const receipt = await scanExternalPhotoIdentificationRetirement({
      projectRoot,
      requirePreservedPaths: false,
    });

    expect(receipt.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "infra/provider-probe" }),
        expect.objectContaining({ path: "workers/provider_bridge.py" }),
      ]),
    );
  });

  it("bounds a canceled scan and rejects its late evidence", async () => {
    const projectRoot = await fixtureRoot();
    const controller = new AbortController();
    controller.abort();

    await expect(
      scanExternalPhotoIdentificationRetirement({
        projectRoot,
        requirePreservedPaths: false,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

async function fixtureRoot() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "overgarden-ove351-retirement-"),
  );
  temporaryRoots.push(root);
  return root;
}
