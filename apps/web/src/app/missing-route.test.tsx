import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import MissingRoute from "./missing-route";

describe("missing route catch-all", () => {
  it("throws not-found while rendering", () => {
    expect(() => MissingRoute()).toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("is mounted under every unprefixed route family", () => {
    const root = path.join(process.cwd(), "src/app/(default)");
    const families = readdirSync(root).filter((name) =>
      statSync(path.join(root, name)).isDirectory(),
    );
    const missing = families.filter(
      (name) =>
        !statSync(path.join(root, name, "[...missing]", "page.tsx")).isFile(),
    );

    expect(families.length).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
