// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Link } from "./link";

describe("Link", () => {
  it("renders a real anchor with its href", () => {
    render(<Link href="/journals">Усі журнали</Link>);
    const link = screen.getByRole("link", { name: "Усі журнали" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/journals");
  });

  it("is in the tab order and takes focus", () => {
    render(<Link href="/journals">Усі журнали</Link>);
    const link = screen.getByRole("link", { name: "Усі журнали" });
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("underlines an inline link at rest, because colour is never the only signal", () => {
    const { rerender } = render(<Link href="/journals">Усі журнали</Link>);
    expect(screen.getByRole("link").className).toContain("underline");
    rerender(
      <Link href="/journals" variant="quiet">
        Усі журнали
      </Link>,
    );
    expect(screen.getByRole("link").className).toContain("hover:underline");
  });

  it("spreads the props that decide navigation onto the anchor", () => {
    render(
      <Link href="https://over.garden" prefetch={false} data-probe="yes">
        OverGarden
      </Link>,
    );
    expect(screen.getByRole("link").getAttribute("data-probe")).toBe("yes");
  });
});
