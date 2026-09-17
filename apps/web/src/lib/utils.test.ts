import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * The regression this file exists for: `cn("text-text-on-fill", "text-body-sm")`
 * used to answer `"text-body-sm"` alone, because `tailwind-merge`'s defaults put
 * a named size and a named colour in the same group. Every filled button in the
 * product then drew its label in body ink on a green fill — 1.95:1, found by an
 * axe scan against the real stylesheet, invisible to every unit test, because
 * both classes were still in the source.
 */
describe("cn", () => {
  it("keeps a type step and a colour together", () => {
    expect(cn("text-text-on-fill", "text-body-sm")).toContain("text-text-on-fill");
    expect(cn("text-text-on-fill", "text-body-sm")).toContain("text-body-sm");
    expect(cn("text-h2", "text-text-heading")).toContain("text-h2");
    expect(cn("text-h2", "text-text-heading")).toContain("text-text-heading");
  });

  it("still lets a later value of the same kind win", () => {
    expect(cn("text-body", "text-body-sm")).toBe("text-body-sm");
    expect(cn("text-text-muted", "text-text")).toBe("text-text");
    expect(cn("z-popover", "z-overlay")).toBe("z-overlay");
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("shadow-popover", "shadow-overlay")).toBe("shadow-overlay");
  });

  it("does not break Tailwind's own scales", () => {
    expect(cn("px-3", "px-4")).toBe("px-4");
    expect(cn("rounded-md", "rounded-lg")).toBe("rounded-lg");
    expect(cn("bg-surface", "bg-surface-hover")).toBe("bg-surface-hover");
  });
});
