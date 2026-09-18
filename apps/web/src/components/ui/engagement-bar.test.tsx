// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EngagementBar } from "./engagement-bar";

describe("EngagementBar", () => {
  it("is a named group holding the controls the page gave it", () => {
    render(
      <EngagementBar label="Дії із записом">
        <button type="submit">Подобається, 12</button>
      </EngagementBar>,
    );

    const bar = screen.getByRole("group", { name: "Дії із записом" });
    expect(bar).toBeTruthy();
    // The controls are the page's own Server Action forms; the bar arranges
    // them and never reimplements them (ADR-0024 D3).
    expect(
      screen.getByRole("button", { name: "Подобається, 12" }),
    ).toBeTruthy();
  });

  it("draws no region of its own when the controls bring one", () => {
    // The entry page's like control carries the count and the region, because
    // its number is the optimistic one. A second region here would announce
    // twice and print the number twice, which is what the first version did.
    const { container } = render(
      <EngagementBar label="Дії із записом">
        <button type="submit">Подобається</button>
        <p data-engagement-status="true" aria-live="polite">
          12 вподобань
        </p>
      </EngagementBar>,
    );

    expect(
      container.querySelectorAll('[data-engagement-status="true"]'),
    ).toHaveLength(1);
  });

  it("draws the region for a surface whose controls have no count", () => {
    const { container } = render(
      <EngagementBar
        label="Дії із записом"
        status="12 вподобань · 3 коментарі"
      />,
    );

    expect(
      container.querySelector('[data-engagement-status="true"]')?.textContent,
    ).toBe("12 вподобань · 3 коментарі");
  });
});
