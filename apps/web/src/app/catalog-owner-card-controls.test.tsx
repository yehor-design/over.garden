import { renderServerHtml } from "@test/render-server-html";
import { describe, expect, it, vi } from "vitest";

vi.mock("./catalog-owner-card-actions", () => ({
  renameCatalogCardAction: vi.fn(),
  pinCatalogCardNameAction: vi.fn(),
  setCatalogCardIndexableAction: vi.fn(),
  mergeCatalogCardAction: vi.fn(),
  revertCatalogCardEditAction: vi.fn(),
}));

import { CatalogOwnerCardControls } from "./catalog-owner-card-controls";

const ITEM = "11111111-1111-4111-8111-111111111111";

function render(
  overrides: Partial<
    Parameters<typeof CatalogOwnerCardControls>[0]
  > = {},
) {
  return renderServerHtml(
    CatalogOwnerCardControls({
      locale: "uk",
      catalogItemId: ITEM,
      canonicalName: "Solanum lycopersicum L.",
      indexableOverride: null,
      names: [
        {
          nameId: "name-1",
          displayName: "Solanum lycopersicum",
          locale: "la",
          nameType: "scientific_accepted",
          isPrimary: true,
        },
        {
          nameId: "name-2",
          displayName: "Помідор",
          locale: "uk",
          nameType: "vernacular",
          isPrimary: false,
        },
      ],
      audit: [
        {
          actionId: "action-1",
          actionType: "rename",
          itemType: null,
          reason: "the register spells it so",
          subjectNames: ["Solanum lycopersicum L."],
          performedAt: new Date("2026-09-06T08:00:00.000Z"),
          automatic: false,
          reverted: false,
        },
        {
          actionId: "action-2",
          actionType: "set_indexable",
          itemType: null,
          reason: null,
          subjectNames: [],
          performedAt: new Date("2026-09-05T08:00:00.000Z"),
          automatic: false,
          reverted: true,
        },
      ],
      ...overrides,
    }),
  );
}

describe("owner card controls (ADR-0026 D10)", () => {
  it("offers rename, pin, merge and indexability, each as its own form", async () => {
    const html = await render();

    expect(html).toContain('data-owner-card-controls="true"');
    expect(html).toContain('data-owner-card-rename="true"');
    expect(html).toContain('data-owner-card-pin="true"');
    expect(html).toContain('data-owner-card-merge="true"');
    expect(html).toContain('data-owner-card-indexable="true"');
    expect(html).toContain('name="targetAddress"');
    expect(html).toContain('value="name-2"');
    expect(html).toContain("Помідор");
    // The card's current name is what the rename box starts from.
    expect(html).toContain("Solanum lycopersicum L.");
  });

  it("lists what was done and offers an undo for what is not reverted yet", async () => {
    const html = await render();

    expect(html).toContain('data-owner-card-audit="true"');
    expect(html).toContain('data-owner-card-undo="action-1"');
    expect(html).not.toContain('data-owner-card-undo="action-2"');
    expect(html).toContain("the register spells it so");
    expect(html).toContain("скасовано");
  });

  it("says so when nothing has been done, and hides pinning without names", async () => {
    const html = await render({ names: [], audit: [] });

    expect(html).not.toContain('data-owner-card-pin="true"');
    expect(html).toContain("Ще нічого.");
    expect(html).toContain('data-owner-card-merge="true"');
  });
});
