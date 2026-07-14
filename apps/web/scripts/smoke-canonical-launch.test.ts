import { describe, expect, it } from "vitest";

import { assertAuthenticatedGardenShell } from "./smoke-canonical-launch";

describe("canonical launch smoke workspace contract", () => {
  it("accepts the current authenticated operational workspace marker", () => {
    expect(() =>
      assertAuthenticatedGardenShell(
        '<main data-garden-workspace="operational-home"></main>',
      ),
    ).not.toThrow();
  });

  it("rejects guest, loading, and legacy text-only workspace states", () => {
    for (const html of [
      '<main data-garden-workspace="guest">Garden journal</main>',
      '<main data-garden-workspace="loading"></main>',
      "<main>Garden journal</main>",
    ]) {
      expect(() => assertAuthenticatedGardenShell(html)).toThrow(
        /signed-in garden shell/,
      );
    }
  });
});
