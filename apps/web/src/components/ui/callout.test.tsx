// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Callout } from "./callout";

describe("Callout", () => {
  it("a form-level error interrupts, because that is what an error is for", () => {
    render(
      <Callout tone="danger" live="assertive" title="Не вдалося зберегти">
        Перевірте адресу пошти.
      </Callout>,
    );
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("a routine success never interrupts", () => {
    render(<Callout tone="success" live="polite" title="Запис опубліковано" />);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("a plain note announces nothing at all", () => {
    render(<Callout title="Цей запис публічний" />);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.getByText("Цей запис публічний")).not.toBeNull();
  });

  it("hides its icon, so the tone reaches a reader through the words", () => {
    const { container } = render(
      <Callout tone="warning" title="Скоро закінчиться" />,
    );
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("Скоро закінчиться");
  });
});
