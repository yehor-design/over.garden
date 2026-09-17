// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("is a named landmark whose neighbours are real links", () => {
    render(
      <Pagination
        label="Сторінки журналів"
        previousHref="/journals?page=1"
        previousLabel="Попередня"
        nextHref="/journals?page=3"
        nextLabel="Наступна"
        status="Сторінка 2 з 9"
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Сторінки журналів" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("link", { name: /Попередня/ }).getAttribute("rel"),
    ).toBe("prev");
    expect(
      screen.getByRole("link", { name: /Наступна/ }).getAttribute("rel"),
    ).toBe("next");
    expect(screen.getByText("Сторінка 2 з 9")).not.toBeNull();
  });

  it("renders a missing neighbour as text, never as a link to nowhere", () => {
    render(
      <Pagination
        label="Сторінки журналів"
        previousLabel="Попередня"
        nextHref="/journals?page=2"
        nextLabel="Наступна"
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    // The edge with nowhere to go is an inactive control, not dimmed text:
    // that is what makes it exempt from 1.4.3 rather than merely low-contrast.
    const previous = screen.getByRole("button", { name: /Попередня/ });
    expect(previous).toHaveProperty("disabled", true);
  });
});
