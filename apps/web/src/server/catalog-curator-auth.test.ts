import { describe, expect, it } from "vitest";

import { scopedToUser } from "@/server/request-scope";
import {
  assertCatalogCuratorAccess,
  parseCatalogCuratorUserIds,
} from "./catalog-curator-auth";

const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

describe("catalog curator auth gate", () => {
  it("parses a comma-separated curator allowlist", () => {
    expect(
      parseCatalogCuratorUserIds(
        " 00000000-0000-0000-0000-000000000001,00000000-0000-0000-0000-000000000002 ",
      ),
    ).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);
  });

  it("denies authenticated users when no allowlist exists", () => {
    expect(() => assertCatalogCuratorAccess(scope, undefined)).toThrow(
      "Catalog curation access denied.",
    );
    expect(() => assertCatalogCuratorAccess(scope, "")).toThrow(
      "Catalog curation access denied.",
    );
  });

  it("allows listed curator users", () => {
    expect(
      assertCatalogCuratorAccess(scope, "00000000-0000-0000-0000-000000000001"),
    ).toEqual({ mode: "allowlist" });
  });

  it("rejects authenticated users outside a configured allowlist", () => {
    expect(() =>
      assertCatalogCuratorAccess(scope, "00000000-0000-0000-0000-000000000099"),
    ).toThrow("Catalog curation access denied.");
  });
});
