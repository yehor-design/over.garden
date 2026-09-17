// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, Surface } from "./card";

describe("Card", () => {
  it("renders the element the page asked for", () => {
    render(
      <Card as="article" aria-label="Перші сходи">
        <p>Томат</p>
      </Card>,
    );
    const card = screen.getByRole("article", { name: "Перші сходи" });
    expect(card.tagName).toBe("ARTICLE");
  });

  it("gains no shadow on hover — only a surface change", () => {
    render(
      <Card interactive aria-label="Перші сходи">
        content
      </Card>,
    );
    const card = screen.getByLabelText("Перші сходи");
    // DESIGN.md §2.5: elevation marks what floats above the page, and a card
    // does not. A `hover:shadow-*` here would be the defect.
    expect(card.className).toContain("hover:bg-surface-hover");
    expect(card.className).not.toMatch(/shadow/);
  });

  it("a surface carries a tone and no border of its own", () => {
    render(
      <Surface tone="sunken" aria-label="Панель">
        content
      </Surface>,
    );
    const surface = screen.getByLabelText("Панель");
    expect(surface.className).toContain("bg-surface-sunken");
    expect(surface.className).not.toMatch(/\bborder\b/);
  });
});
