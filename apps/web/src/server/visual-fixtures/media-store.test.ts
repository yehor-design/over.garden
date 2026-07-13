import { describe, expect, it } from "vitest";

import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_NAMESPACE,
} from "@/lib/visual-fixtures/manifest";
import {
  deleteVisualFixtureMedia,
  uploadVisualFixtureMedia,
  type VisualFixtureObjectStore,
} from "./media-store";

class RecordingObjectStore implements VisualFixtureObjectStore {
  readonly puts: Parameters<VisualFixtureObjectStore["putObject"]>[0][] = [];
  readonly publicDeletes: string[] = [];
  readonly quarantineDeletes: string[] = [];

  async putObject(
    input: Parameters<VisualFixtureObjectStore["putObject"]>[0],
  ): Promise<void> {
    this.puts.push(input);
  }

  async deletePublicObject(key: string): Promise<void> {
    this.publicDeletes.push(key);
  }

  async deleteQuarantineObject(key: string): Promise<void> {
    this.quarantineDeletes.push(key);
  }

  async hasPublicObject(): Promise<boolean> {
    return true;
  }
}

describe("visual fixture media store", () => {
  it("uploads verified local PNGs to exact deterministic derivative keys", async () => {
    const store = new RecordingObjectStore();

    const uploaded = await uploadVisualFixtureMedia(
      store,
      VISUAL_FIXTURE_MANIFEST,
      process.cwd(),
    );

    expect(uploaded).toBe(16);
    expect(store.puts).toHaveLength(16);
    expect(store.puts.map(({ key }) => key)).toEqual(
      VISUAL_FIXTURE_MANIFEST.media.map(({ derivativeKey }) => derivativeKey),
    );
    expect(
      store.puts.every(({ key }) =>
        key.startsWith(`${VISUAL_FIXTURE_NAMESPACE}/`),
      ),
    ).toBe(true);
    expect(
      store.puts.every(({ contentType }) => contentType === "image/png"),
    ).toBe(true);
    expect(
      store.puts.every(({ cacheControl }) =>
        cacheControl.includes("immutable"),
      ),
    ).toBe(true);
    expect(store.puts.map(({ sha256 }) => sha256)).toEqual(
      VISUAL_FIXTURE_MANIFEST.media.map(({ sha256 }) => sha256),
    );
  });

  it("deletes only exact current and retired manifest media keys", async () => {
    const store = new RecordingObjectStore();

    const deleted = await deleteVisualFixtureMedia(
      store,
      VISUAL_FIXTURE_MANIFEST,
    );

    const expectedDerivativeKeys = VISUAL_FIXTURE_MANIFEST.media.map(
      ({ derivativeKey }) => derivativeKey,
    );
    const expectedQuarantineKeys = VISUAL_FIXTURE_MANIFEST.media.map(
      ({ quarantineKey }) => quarantineKey,
    );
    const retiredNamespaces = [
      "visual-fixtures/ove187-v5",
      "visual-fixtures/ove187-v6",
      "visual-fixtures/ove187-v7",
    ];
    const retiredDerivativeKeys = retiredNamespaces.flatMap((namespace) =>
      VISUAL_FIXTURE_MANIFEST.media.map(
        ({ fileName }) => `${namespace}/${fileName}`,
      ),
    );
    const retiredQuarantineKeys = retiredNamespaces.flatMap((namespace) =>
      VISUAL_FIXTURE_MANIFEST.media.map(
        ({ fileName }) => `${namespace}/quarantine/${fileName}`,
      ),
    );
    expect(deleted).toBe(
      expectedDerivativeKeys.length +
        expectedQuarantineKeys.length +
        retiredDerivativeKeys.length +
        retiredQuarantineKeys.length,
    );
    expect(store.publicDeletes).toEqual([
      ...expectedDerivativeKeys,
      ...retiredDerivativeKeys,
    ]);
    expect(store.quarantineDeletes).toEqual([
      ...expectedQuarantineKeys,
      ...retiredQuarantineKeys,
    ]);
    expect(
      [...store.publicDeletes, ...store.quarantineDeletes].every((key) =>
        [VISUAL_FIXTURE_NAMESPACE, ...retiredNamespaces].some((namespace) =>
          key.startsWith(`${namespace}/`),
        ),
      ),
    ).toBe(true);
  });
});
