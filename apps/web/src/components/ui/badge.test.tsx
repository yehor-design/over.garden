// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("always carries a word, because colour is never the only signal", () => {
    render(<Badge tone="danger">Видалено</Badge>);
    const badge = screen.getByText("Видалено");
    expect(badge.textContent?.trim()).not.toBe("");
    expect(badge.className).toContain("bg-danger-surface");
  });

  it("is a label, not a control", () => {
    render(<Badge>Чернетка</Badge>);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Чернетка").tagName).toBe("SPAN");
  });
});
