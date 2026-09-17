// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("is a box the size of the thing that has not arrived, and nothing else", () => {
    const { container } = render(
      <section aria-busy="true" aria-label="Завантаження записів">
        <Skeleton className="h-6 w-40" />
      </section>,
    );
    const box = container.querySelector('[data-slot="skeleton"]');
    expect(box?.textContent).toBe("");
    // The busy section owns the announcement; the box says nothing of its own.
    expect(screen.getByLabelText("Завантаження записів")).not.toBeNull();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});
