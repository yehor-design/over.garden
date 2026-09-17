// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Separator } from "./separator";

describe("Separator", () => {
  it("is a real separator, with the orientation it was given", () => {
    render(<Separator />);
    const rule = screen.getByRole("separator");
    expect(rule.getAttribute("data-slot")).toBe("separator");
    expect(rule.getAttribute("aria-orientation")).not.toBe("vertical");
  });

  it("carries the divider colour, which identifies nothing and may be faint", () => {
    render(<Separator orientation="vertical" />);
    const rule = screen.getByRole("separator");
    expect(rule.getAttribute("aria-orientation")).toBe("vertical");
    // `border` (neutral-200, 1.28) is correct here precisely because a divider
    // identifies no control — a control boundary would need `border-control`.
    expect(rule.className).toContain("bg-border");
  });
});
