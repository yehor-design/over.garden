// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("gives the page exactly one h1, with its sentence and its actions", () => {
    render(
      <PageHeader
        eyebrow="Журнали"
        title="Балконні томати"
        description="Один сезон, від сходів до врожаю."
        actions={<button type="button">Новий запис</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Балконні томати" }),
    ).not.toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(
      screen.getByText("Один сезон, від сходів до врожаю."),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Новий запис" })).not.toBeNull();
  });

  it("is a banner-free header a page can put anywhere", () => {
    const { container } = render(<PageHeader title="Балконні томати" />);
    expect(container.querySelector("header")).not.toBeNull();
  });
});
