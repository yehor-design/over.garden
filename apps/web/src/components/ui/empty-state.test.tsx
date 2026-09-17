// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Chip } from "./chip";
import { EmptyState } from "./empty-state";

const ILLUSTRATION = {
  src: "https://media.over.garden/illustrations/empty-journal.webp",
  width: 512,
  height: 512,
};

describe("EmptyState", () => {
  it("first run: an illustration, a sentence, a line and one action", () => {
    const { container } = render(
      <EmptyState
        illustration={ILLUSTRATION}
        title="Тут ще нічого немає"
        description="Перший запис починає історію цієї рослини."
        action={<button type="button">Новий запис</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Тут ще нічого немає" }),
    ).not.toBeNull();
    const image = container.querySelector("img");
    // The heading carries the meaning, so the picture is decorative and its
    // box is reserved.
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("width")).toBe("144");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("no results: no illustration, the active filters instead", () => {
    const { container } = render(
      <EmptyState
        variant="no-results"
        illustration={ILLUSTRATION}
        title="Нічого не збіглося"
        filters={<Chip label="Томати" />}
        action={<button type="button">Очистити фільтри</button>}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("Томати")).not.toBeNull();
    expect(
      container.querySelector('[data-screen-state="empty-no-results"]'),
    ).not.toBeNull();
  });

  it("renders without an illustration when the manifest has none", () => {
    const { container } = render(
      <EmptyState illustration={null} title="Тут ще нічого немає" />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { level: 3, name: "Тут ще нічого немає" }),
    ).not.toBeNull();
  });

  it("uses the card size when it sits inside one", () => {
    const { container } = render(
      <EmptyState
        illustration={ILLUSTRATION}
        illustrationSize="card"
        title="Тут ще нічого немає"
      />,
    );
    expect(container.querySelector("img")?.getAttribute("width")).toBe("96");
  });
});
