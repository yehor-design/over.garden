import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  deleteVisualFixtureMedia,
  uploadVisualFixtureMedia,
  type VisualFixtureObjectStore,
} from "./media-store";

class RecordingObjectStore implements VisualFixtureObjectStore {
  readonly puts: Parameters<VisualFixtureObjectStore["putObject"]>[0][] = [];
  readonly publicDeletes: string[] = [];

  async putObject(
    input: Parameters<VisualFixtureObjectStore["putObject"]>[0],
  ): Promise<void> {
    this.puts.push(input);
  }

  async deletePublicObject(key: string): Promise<void> {
    this.publicDeletes.push(key);
  }

  async hasPublicObject(): Promise<boolean> {
    return true;
  }
}

describe("visual fixture media store", () => {
  it("uploads exact verified local WebPs to deterministic derivative keys", async () => {
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
    expect(store.puts.every(({ key }) => key.startsWith("derivatives/"))).toBe(
      true,
    );
    expect(
      store.puts.every(({ contentType }) => contentType === "image/webp"),
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

  it("deletes only exact current final derivative keys", async () => {
    const store = new RecordingObjectStore();

    const deleted = await deleteVisualFixtureMedia(
      store,
      VISUAL_FIXTURE_MANIFEST,
    );

    const expectedDerivativeKeys = VISUAL_FIXTURE_MANIFEST.media.map(
      ({ derivativeKey }) => derivativeKey,
    );
    expect(deleted).toBe(expectedDerivativeKeys.length);
    expect(store.publicDeletes).toEqual(expectedDerivativeKeys);
  });
});
